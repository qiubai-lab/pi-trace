import { describe, expect, it, vi } from "vitest";
import example from "../examples/instrumented-tool.ts";
import {
  emitTrace,
  validTraceSignal,
  TRACE_BUS_EVENT,
} from "./instrumentation.ts";
import { ExecutionProjector } from "./analysis/execution.ts";
import type { TraceEventDetail } from "./contracts.ts";
describe("cooperative protocol AC-005", () => {
  it("runs the standalone example and emits valid nested spans plus an artifact", async () => {
    let tool: any;
    const signals: unknown[] = [];
    example({
      registerTool: (definition: unknown) => {
        tool = definition;
      },
      events: {
        emit: (_name: string, value: unknown) => {
          signals.push(value);
        },
      },
    } as any);
    const result = await tool.execute(
      "call",
      { text: "abc" },
      new AbortController().signal,
    );
    expect(result.content[0].text).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(signals).toHaveLength(5);
    expect(signals.every(validTraceSignal)).toBe(true);
    expect(signals[2]).toMatchObject({
      action: "artifact.attach",
      artifact: { type: "json" },
    });
    expect(
      validTraceSignal({
        get version() {
          throw new Error("bad producer");
        },
      }),
    ).toBe(false);
  });
  it("validates namespaced non-self-parent spans and works without a consumer", () => {
    const signal = {
      version: 1,
      namespace: "example.plugin",
      action: "span.start",
      spanId: "s",
      name: "step",
    } as const;
    const bus = { emit: vi.fn() };
    emitTrace(bus, signal);
    expect(bus.emit).toHaveBeenCalledWith(TRACE_BUS_EVENT, signal);
    expect(validTraceSignal({ ...signal, namespace: "../../path" })).toBe(
      false,
    );
    expect(validTraceSignal({ ...signal, parentSpanId: "s" })).toBe(false);
    expect(validTraceSignal({ ...signal, version: 2 })).toBe(false);
  });
  it("isolates the same span ID by namespace and preserves explicit parent identity", () => {
    const p = new ExecutionProjector();
    const e = (namespace: string): TraceEventDetail => ({
      eventId: namespace,
      eventType: "qb_span",
      sequence: 1,
      timestamp: "",
      timestampMs: 1,
      monotonicNs: "1",
      sessionId: "s",
      runtimeId: "r",
      observationStage: "cooperative",
      payloadBytes: 1,
      isError: false,
      payloadJson: JSON.stringify({
        version: 1,
        namespace,
        spanId: "child",
        parentSpanId: "parent",
        action: "span.start",
        name: "child",
      }),
    });
    const a = p.project(e("first"), 1, () => undefined)[0];
    const b = p.project(e("second"), 2, () => undefined)[0];
    expect(a.id).not.toBe(b.id);
    expect(a.parentId).toBe("s:r:span:first:parent");
    expect(a.source).toContain("显式埋点");
    const cancelled = p.project({ ...e("first"), eventId: "cancel", sequence: 2, timestampMs: 200, payloadJson: JSON.stringify({ version: 1, namespace: "first", spanId: "child", action: "span.end", status: "cancelled" }) }, 3, id => id === a.id ? a : undefined)[0];
    expect(cancelled.status).toBe("incomplete");
    expect(cancelled.end).toBe(200);
    const artifact = p.project({ ...e("first"), eventId: "artifact", sequence: 3, timestampMs: 300, payloadJson: JSON.stringify({ version: 1, namespace: "first", spanId: "child", action: "artifact.attach", artifact: { type: "file", name: "report", path: "/not-read" } }) }, 4, id => id === a.id ? cancelled : undefined)[0];
    expect(artifact.status).toBe("incomplete");
    expect(artifact.end).toBe(200);
  });
});
