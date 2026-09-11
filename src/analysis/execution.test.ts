import { describe, expect, it } from "vitest";
import { ExecutionProjector } from "./execution.ts";
import type { TraceEventDetail } from "../contracts.ts";
import type { Operation } from "./execution-contracts.ts";
const event = (
  type: string,
  sequence: number,
  payload: unknown,
  extra: Partial<TraceEventDetail> = {},
): TraceEventDetail => ({
  eventId: `r:${sequence}`,
  eventType: type,
  sequence,
  timestampMs: 1000,
  timestamp: new Date(1000).toISOString(),
  monotonicNs: String(sequence),
  sessionId: "s",
  runtimeId: "r",
  observationStage: type,
  payloadBytes: 1,
  payloadJson: JSON.stringify(payload),
  isError: false,
  agentRunId: "a",
  turnIndex: 0,
  ...extra,
});
describe("execution semantics AC-001", () => {
  it("independently addresses mixed message blocks and never creates a fake completed tool", () => {
    const projector = new ExecutionProjector();
    const ops = new Map<string, Operation>();
    const result = projector.project(
      event(
        "message_end",
        1,
        {
          message: {
            role: "assistant",
            content: [
              { thinking: "think" },
              { text: "answer" },
              {
                type: "toolCall",
                id: "call",
                name: "read",
                arguments: { path: "a" },
              },
            ],
          },
        },
        { messageId: "m" },
      ),
      1,
      (id) => ops.get(id),
    );
    expect(result.map((o) => o.kind)).toEqual([
      "thinking",
      "assistant",
      "tool",
    ]);
    expect(new Set(result.map((o) => o.id)).size).toBe(3);
    expect(result[1].blockIndex).toBe(1);
    expect(result[2].status).toBe("observed");
  });
  it("pairs parallel tools and treats repeated error observations as one operation", () => {
    const p = new ExecutionProjector();
    const ops = new Map<string, Operation>();
    for (const [i, type, call] of [
      [1, "tool_execution_start", "x"],
      [2, "tool_execution_start", "y"],
      [3, "tool_result", "y"],
      [4, "tool_execution_end", "y"],
    ] as const) {
      for (const o of p.project(
        event(
          type,
          i,
          {
            toolName: "read",
            toolCallId: call,
            args: { path: call },
            isError: i > 2,
          },
          { toolCallId: call },
        ),
        i,
        (id) => ops.get(id),
      ))
        ops.set(o.id, o);
    }
    expect(ops.size).toBe(2);
    expect([...ops.values()].filter((o) => o.status === "error")).toHaveLength(
      1,
    );
    expect(
      [...ops.values()].find((o) => o.toolCallId === "y")?.eventCount,
    ).toBe(3);
  });
  it("keeps unknown beginnings and unfinished spans honest", () => {
    const p = new ExecutionProjector();
    const result = p.project(
      event(
        "tool_execution_end",
        5,
        { toolName: "bash", toolCallId: "z" },
        { toolCallId: "z" },
      ),
      5,
      () => undefined,
    );
    expect(result[0].incompleteStart).toBe(true);
  });
});
