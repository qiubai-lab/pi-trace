import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TraceCollector } from "./collector.ts";
import { RuntimeDiagnosticsStore } from "./diagnostics.ts";
import { CorrelationState } from "./events.ts";
import type { TraceStoreWriter } from "./store.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function diagnostics(runtimeId = "r") { const root = await mkdtemp(join(tmpdir(), "qb-trace-diag-")); roots.push(root); return new RuntimeDiagnosticsStore(root, runtimeId); }

function envelope(sequence = 1) {
  const state = new CorrelationState("r");
  let result = state.envelope("message_update", { text: "secret" }, { sessionId: "s" });
  while (result.sequence < sequence) result = state.envelope("message_update", {}, { sessionId: "s" });
  return result;
}

describe("trace collector", () => {
  it("batches writes and never mutates or truncates an event", async () => {
    const append = vi.fn();
    const writer: TraceStoreWriter = { append, close: vi.fn() };
    const collector = new TraceCollector({ writer: () => writer, diagnostics: await diagnostics(), flushIntervalMs: 10 });
    const event = envelope();
    collector.enqueue(event);
    await collector.flush();
    expect(append).toHaveBeenCalledWith([event]);
    expect(event.payloadJson).toContain("secret");
    await collector.stop();
  });

  it("fails open and reports whole-event loss after bounded retries", async () => {
    const writer: TraceStoreWriter = { append: vi.fn(() => { throw new Error("disk full"); }), close: vi.fn() };
    const diag = await diagnostics();
    const collector = new TraceCollector({ writer: () => writer, diagnostics: diag, maxAttempts: 2, flushIntervalMs: 60_000 });
    collector.enqueue(envelope());
    await collector.flush();
    await collector.flush();
    expect((await diag.load()).droppedEvents).toBe(1);
    expect((await diag.load()).lastError).toContain("disk full");
    await collector.stop(10);
  });

  it("drops an oversized event instead of truncating it", async () => {
    const diag = await diagnostics();
    const collector = new TraceCollector({ writer: () => ({ append() {}, close() {} }), diagnostics: diag, maxQueueBytes: 10 });
    expect(collector.enqueue(envelope())).toBe(false);
    expect((await diag.load()).droppedEvents).toBe(1);
    await collector.stop();
  });

  it("honors a bounded shutdown and reports events left behind", async () => {
    const diag = await diagnostics();
    const collector = new TraceCollector({
      writer: () => ({ append() { throw new Error("database disk image is malformed"); }, close() {} }),
      diagnostics: diag,
      maxAttempts: 1_000,
      flushIntervalMs: 60_000,
    });
    collector.enqueue(envelope());
    const started = Date.now();
    await collector.stop(20);
    expect(Date.now() - started).toBeLessThan(200);
    const state = await diag.load();
    expect(state.droppedEvents).toBe(1);
    expect(state.lastError).toMatch(/deadline|malformed/);
  });
});
