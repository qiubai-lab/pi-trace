import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { WorkerClient } from "./workers/client.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TraceStore } from "./store.ts";
import { CorrelationState } from "./events.ts";
import { ExecutionService } from "./execution-service.ts";
import { WorkerTraceWriter } from "./storage/worker-writer.ts";
import { resolveTracePaths } from "./paths.ts";
import { startTraceServer } from "./server.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "trace-worker-"));
  roots.push(root);
  const paths = resolveTracePaths({ QB_TRACE_HOME: root });
  return paths;
}
describe("worker pipeline and execution routes AC-004/006", () => {
  it("ships plain JavaScript workers that also run inside node_modules", async () => {
    const paths = await fixture();
    const target = join(
      paths.home,
      "node_modules",
      "trace-package",
      "dist",
      "workers",
    );
    await mkdir(target, { recursive: true });
    await cp("dist/workers", target, { recursive: true });
    const client = new WorkerClient(pathToFileURL(join(target, "writer.mjs")), {
      database: paths.database,
    });
    try {
      await client.call("append", [
        [
          new CorrelationState("installed").envelope(
            "input",
            { text: "installed worker" },
            { sessionId: "s" },
          ),
        ],
      ]);
    } finally {
      await client.close();
    }
    const store = new TraceStore(paths.database, { readOnly: true });
    try {
      expect(store.countEvents()).toBe(1);
    } finally {
      store.close();
    }
  });

  it("writes in a worker and exposes committed cursors, including old-timestamp late events", async () => {
    const paths = await fixture();
    const writer = new WorkerTraceWriter(paths.database);
    const service = new ExecutionService(paths.database);
    const c = new CorrelationState("worker");
    try {
      await writer.append([
        c.envelope("input", { text: "first Bearer placeholder-secret" }, { sessionId: "s" }),
      ]);
      const first = await service.cursor();
      expect(first.revision).toBe(1);
      expect(JSON.stringify(await service.page({ sessionId: "s" }))).not.toContain("placeholder-secret");
      expect((await service.raw("worker:1", 0, true))?.text).toContain("placeholder-secret");
      const late = c.envelope(
        "input",
        { text: "late-commit" },
        { sessionId: "s" },
      );
      late.timestampMs = 1;
      await writer.append([late]);
      const second = await service.cursor();
      expect(second.revision).toBeGreaterThan(first.revision);
      expect(
        (await service.page({ sessionId: "s" })).items.map((op) => op.summary),
      ).toContain("late-commit");
      await writer.append([c.envelope("input", { text: "unrelated" }, { sessionId: "other-session" })]);
      expect((await service.cursor("s")).revision).toBe(second.revision);
      expect((await service.cursor()).revision).toBeGreaterThan(second.revision);
    } finally {
      await writer.close();
      await service.close();
    }
  });
  it("authenticates new APIs, rejects writes/invalid windows, and resumes invalidation watermarks", async () => {
    const paths = await fixture();
    const c = new CorrelationState("test");
    const store = new TraceStore(paths.database);
    store.append([
      c.envelope(
        "tool_execution_start",
        { toolCallId: "c", toolName: "read", args: { path: "a" } },
        { sessionId: "s" },
      ),
    ]);
    const server = await startTraceServer(paths, {
      port: 0,
      token: "test-token",
    });
    const origin = `http://127.0.0.1:${server.port}`;
    const headers = { Authorization: "Bearer test-token" };
    const abort = new AbortController();
    try {
      expect(
        (await fetch(`${origin}/api/v1/execution/page?session=s`)).status,
      ).toBe(401);
      expect(
        (
          await fetch(`${origin}/api/v1/execution/page?session=s&limit=500`, {
            headers,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await fetch(`${origin}/api/v1/execution/page?session=s`, {
            headers,
            method: "POST",
          })
        ).status,
      ).toBe(405);
      const page = (await (
        await fetch(`${origin}/api/v1/execution/page?session=s`, { headers })
      ).json()) as any;
      expect(page.items[0].name).toBe("read");
      expect(page.items[0]).not.toHaveProperty("payloadJson");
      const future = await fetch(
        `${origin}/api/v1/execution/raw?id=test%3A1&at=0`,
        { headers },
      );
      expect(future.status).toBe(404);
      const stream = await fetch(
        `${origin}/api/v1/execution/stream?session=s&cursor=obsolete:999`,
        { headers, signal: abort.signal },
      );
      const reader = stream.body!.getReader();
      const frame = new TextDecoder().decode((await reader.read()).value);
      expect(frame).toContain('"reset":true');
      expect(frame).toContain('"revision":1');
      abort.abort();
      await reader.cancel().catch(() => {});
      const cursor = JSON.parse(frame.split("data: ")[1].trim()).cursor;
      store.append([
        c.envelope(
          "tool_execution_end",
          {
            toolCallId: "c",
            toolName: "read",
            result: { content: [{ text: "done" }] },
          },
          { sessionId: "s" },
        ),
      ]);
      const reconnect = new AbortController();
      try {
        const response = await fetch(
          `${origin}/api/v1/execution/stream?session=s&cursor=${encodeURIComponent(cursor)}`,
          { headers, signal: reconnect.signal },
        );
        const nextReader = response.body!.getReader();
        const next = new TextDecoder().decode((await nextReader.read()).value);
        expect(next).toContain('"revision":2');
        expect(next).toContain('"reset":false');
        reconnect.abort();
        await nextReader.cancel().catch(() => {});
      } finally {
        reconnect.abort();
      }
    } finally {
      abort.abort();
      store.close();
      await server.close();
    }
  });
});
