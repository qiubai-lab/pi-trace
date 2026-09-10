import { describe, expect, it } from "vitest";
import { CorrelationState, serializePayload } from "./events.ts";

describe("trace event model", () => {
  it("serializes full values without mutating the observed payload", () => {
    const payload = { authorization: "Bearer secret", nested: { value: 1n }, missing: undefined };
    const before = payload.nested;
    const encoded = serializePayload(payload);
    expect(encoded).toContain("Bearer secret");
    expect(encoded).toContain("$bigint");
    expect(encoded).toContain("$undefined");
    expect(payload.nested).toBe(before);
  });

  it("assigns monotonic runtime sequence and call-id correlation", () => {
    const state = new CorrelationState("runtime-1");
    state.beginAgent();
    state.beginTurn(3);
    const first = state.envelope("tool_execution_start", { toolCallId: "call-1" }, { sessionId: "session-1" });
    const second = state.envelope("tool_execution_end", { toolCallId: "call-1" }, { sessionId: "session-1" });
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
    expect(second.turnIndex).toBe(3);
    expect(second.toolCallId).toBe("call-1");
    expect(first.eventId).not.toBe(second.eventId);
  });
});
