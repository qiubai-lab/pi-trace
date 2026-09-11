import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TraceStore } from "../store.ts";
import { CorrelationState } from "../events.ts";
import { ExecutionIndex } from "./execution-index.ts";
import { inspectOperation, rawSlice } from "../analysis/inspection.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "trace-execution-test-"));
  roots.push(root);
  const path = join(root, "traces.sqlite");
  const store = new TraceStore(path);
  const correlation = new CorrelationState("r");
  correlation.beginAgent();
  correlation.beginTurn(0);
  const append = (type: string, p: unknown, at: number) => {
    const e = correlation.envelope(type, p, {
      sessionId: "s",
      cwd: "/fixture",
    });
    e.timestampMs = at;
    e.timestamp = new Date(at).toISOString();
    store.append([e]);
    return e;
  };
  return { store, path, append };
}
describe("rebuildable execution index AC-001/003/004/006", () => {
  it("does not expose future results during replay and joins actual evidence", async () => {
    const { store, path, append } = await setup();
    append(
      "tool_execution_start",
      { toolCallId: "a", toolName: "read", args: { path: "file.ts" } },
      100,
    );
    const result = append(
      "tool_result",
      {
        toolCallId: "a",
        toolName: "read",
        content: [{ text: "FUTURE RESULT" }],
        isError: true,
      },
      300,
    );
    append(
      "tool_execution_end",
      {
        toolCallId: "a",
        toolName: "read",
        result: { content: [{ text: "FUTURE RESULT" }] },
        isError: true,
      },
      400,
    );
    const index = new ExecutionIndex(path);
    while (index.sync()) {}
    try {
      const page = index.page({ sessionId: "s" });
      expect(page.overview.errors).toBe(1);
      expect(page.items).toHaveLength(1);
      const before = inspectOperation(index, page.items[0].id, 200)!;
      expect(before.operation.status).toBe("running");
      expect(JSON.stringify(before)).not.toContain("FUTURE RESULT");
      expect(before.events).toHaveLength(1);
      const after = inspectOperation(index, page.items[0].id)!;
      expect(after.sections.map((s) => s.text).join()).toContain("file.ts");
      expect(after.sections.map((s) => s.text).join()).toContain(
        "FUTURE RESULT",
      );
      expect(index.page({ sessionId: "s", at: 200 }).overview.errors).toBe(0);
      expect(index.page({ sessionId: "s", at: 50 }).items).toHaveLength(0);
      expect(index.resolveEvent(result.eventId)).toBe(page.items[0].id);
    } finally {
      index.close();
      store.close();
    }
  });
  it("orders numeric sequence, finds deep targets and rebuilds after prune without modifying schema", async () => {
    const { store, path, append } = await setup();
    for (let i = 0; i < 230; i++) append("input", { text: `marker-${i}` }, 100);
    const index = new ExecutionIndex(path);
    while (index.sync(50)) {}
    try {
      expect(
        index
          .page({ sessionId: "s", view: "events", limit: 12 })
          .events!.map((e) => e.sequence),
      ).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
      const focused = index.page({
        sessionId: "s",
        focus: "r:225",
        limit: 100,
      });
      expect(focused.offset).toBe(200);
      expect(focused.items.some((o) => o.contentEventId === "r:225")).toBe(
        true,
      );
      expect(index.page({ sessionId: "s", search: "marker-229" }).total).toBe(
        1,
      );
      const epoch = index.epoch;
      store.pruneEvents();
      store.checkpointAndVacuum();
      index.sync();
      expect(index.epoch).not.toBe(epoch);
      expect(index.page({ sessionId: "s" }).total).toBe(0);
      expect(store.schemaVersion()).toBe(1);
      append("input", { text: "new" }, 1);
      index.sync();
      expect(
        index.page({ sessionId: "s" }).items.some((o) => o.summary === "new"),
      ).toBe(true);
    } finally {
      index.close();
      store.close();
    }
  });
  it("restores projection state across reopen and handles clock-backdated late commits", async () => {
    const { store, path, append } = await setup();
    append("before_provider_request", { payload: { text: "request" } }, 500);
    let index = new ExecutionIndex(path);
    index.sync();
    const cursor = index.revision;
    index.close();
    append("after_provider_response", { status: 200 }, 400);
    index = new ExecutionIndex(path);
    index.sync();
    try {
      expect(index.revision).toBeGreaterThan(cursor);
      expect(index.page({ sessionId: "s" }).items).toHaveLength(1);
    } finally {
      index.close();
      store.close();
    }
  });
  it("shares a derived cache without double-projecting events across readers", async () => {
    const { store, path, append } = await setup();
    append(
      "tool_execution_start",
      { toolCallId: "a", toolName: "read", args: { path: "a" } },
      100,
    );
    const first = new ExecutionIndex(path);
    const second = new ExecutionIndex(path);
    try {
      first.sync();
      second.sync();
      expect(second.page({ sessionId: "s" }).items[0].eventCount).toBe(1);
      append(
        "tool_execution_end",
        {
          toolCallId: "a",
          toolName: "read",
          result: {
            content: [{ text: "x".repeat(30_000) + "unique-deep-content" }],
          },
        },
        200,
      );
      second.sync();
      first.sync();
      expect(first.page({ sessionId: "s" }).items[0].eventCount).toBe(2);
      expect(
        first.page({ sessionId: "s", search: "unique-deep-content" }).total,
      ).toBe(1);
      expect(
        first.page({ sessionId: "s", search: "unique-deep-content", at: 150 })
          .total,
      ).toBe(0);
    } finally {
      first.close();
      second.close();
      store.close();
    }
  });

  it("retains explicit artifacts after span end and marks interrupted operations incomplete", async () => {
    const { store, path, append } = await setup();
    append(
      "qb_span",
      { version: 1, namespace: "example", spanId: "s", action: "span.start" },
      100,
    );
    append(
      "qb_span",
      {
        version: 1,
        namespace: "example",
        spanId: "s",
        action: "artifact.attach",
        artifact: { name: "report", type: "text", text: "durable report" },
      },
      200,
    );
    append(
      "qb_span",
      { version: 1, namespace: "example", spanId: "s", action: "span.end" },
      300,
    );
    append(
      "tool_execution_start",
      { toolCallId: "interrupted", toolName: "bash" },
      400,
    );
    append("session_shutdown", { reason: "quit" }, 500);
    const index = new ExecutionIndex(path);
    index.sync();
    try {
      const page = index.page({ sessionId: "s" });
      const span = page.items.find((op) => op.kind === "span")!;
      expect(
        inspectOperation(index, span.id)?.sections.some(
          (s) => s.text === "durable report",
        ),
      ).toBe(true);
      expect(
        inspectOperation(index, span.id, 150)?.sections.some(
          (s) => s.text === "durable report",
        ),
      ).toBe(false);
      expect(
        page.items.find((op) => op.toolCallId === "interrupted")?.status,
      ).toBe("incomplete");
    } finally {
      index.close();
      store.close();
    }
  });

  it("bounds and masks raw slices without mutating the authoritative payload", async () => {
    const { store, path, append } = await setup();
    const e = append(
      "before_provider_headers",
      {
        headers: { authorization: "Bearer private-key" },
        huge: "x".repeat(100_000),
      },
      100,
    );
    const index = new ExecutionIndex(path);
    index.sync();
    try {
      const raw = index.event(e.eventId)!;
      expect(rawSlice(raw).text).not.toContain("private-key");
      expect(rawSlice(raw, 0, true).text).toContain("private-key");
      expect(rawSlice(raw).text.length).toBe(24_000);
      expect(rawSlice(raw, 24_000).offset).toBe(24_000);
      expect(raw.payloadJson).toContain("private-key");
    } finally {
      index.close();
      store.close();
    }
  });
});
