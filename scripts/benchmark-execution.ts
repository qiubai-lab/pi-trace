import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { TraceStore } from "../src/store.ts";
import { ExecutionIndex } from "../src/storage/execution-index.ts";
import { executionFixture } from "../src/testing/execution-fixture.ts";
import { inspectOperation } from "../src/analysis/inspection.ts";
const root = await mkdtemp(join(tmpdir(), "qb-execution-bench-"));
const path = join(root, "traces.sqlite");
const measure = <T>(label: string, fn: () => T): T => {
  const start = performance.now();
  const value = fn();
  console.log(`${label}: ${(performance.now() - start).toFixed(1)} ms`);
  return value;
};
try {
  const store = new TraceStore(path);
  const events = executionFixture(2700, "large");
  measure("append 100k+ realistic mixed events", () => {
    for (let i = 0; i < events.length; i += 200)
      store.append(events.slice(i, i + 200));
  });
  store.close();
  console.log(
    `events: ${events.length}; raw payload: ${(events.reduce((n, e) => n + e.payloadBytes, 0) / 1048576).toFixed(1)} MiB`,
  );
  const index = new ExecutionIndex(path);
  try {
    measure("cold index rebuild", () => {
      while (index.sync(500)) {}
    });
    const page = measure("warm page 100", () =>
      index.page({ sessionId: "large", limit: 100 }),
    );
    console.log(
      `operations: ${page.total}; page bytes: ${Buffer.byteLength(JSON.stringify(page))}; groups: ${page.groups.length}`,
    );
    measure("filtered failure page", () =>
      index.page({ sessionId: "large", status: "error", limit: 100 }),
    );
    measure("deep target window", () =>
      index.page({ sessionId: "large", focus: events.at(-3)!.eventId }),
    );
    measure("historical snapshot page", () =>
      index.page({
        sessionId: "large",
        at: events[Math.floor(events.length / 2)]!.timestampMs,
        limit: 100,
      }),
    );
    measure("idle sync", () => index.sync());
    const selected = page.items.find((op) => op.kind === "tool")!;
    const detail = measure("tool inspector", () =>
      inspectOperation(index, selected.id),
    );
    console.log(
      `inspector bytes: ${Buffer.byteLength(JSON.stringify(detail))}`,
    );
    if (page.items.length > 100 || page.total < 10_000)
      throw new Error("large-window benchmark fixture/limit failed");
  } finally {
    index.close();
  }
} finally {
  await rm(root, { recursive: true, force: true });
}
