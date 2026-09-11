import { describe, expect, it } from "vitest";
import type { TraceEventDetail, TraceEventSummary } from "../contracts.ts";
import { mergeConversationItems, projectConversationEvents, projectTimelineEvents } from "./projections.ts";

function summary(overrides: Partial<TraceEventSummary> = {}): TraceEventSummary {
  return {
    eventId: "e1", eventType: "turn_start", timestamp: "2026-09-10T00:00:00.000Z", timestampMs: 1,
    runtimeId: "runtime", sessionId: "session", sequence: 1, payloadBytes: 2, isError: false, ...overrides,
  };
}

function detail(overrides: Partial<TraceEventDetail> = {}): TraceEventDetail {
  return {
    ...summary(), observationStage: "event", monotonicNs: "1", payloadJson: "{}", ...overrides,
  };
}

describe("Session analysis projections", () => {
  it("places correlated and uncorrelated events in deterministic hierarchy keys", () => {
    const items = projectTimelineEvents([
      summary({ eventId: "turn", agentRunId: "run", turnIndex: 2 }),
      summary({ eventId: "run", agentRunId: "run" }),
      summary({ eventId: "session" }),
    ]);
    expect(items.map(item => [item.eventId, item.runKey, item.turnKey, item.hierarchyDepth])).toEqual([
      ["turn", "run", "run:turn:2", 2],
      ["run", "run", "run:unscoped", 1],
      ["session", "session:session", "session:session:unscoped", 0],
    ]);
  });

  it("projects complete semantic conversation blocks with unique source-linked identities", () => {
    const items = projectConversationEvents([
      detail({ eventId: "system", eventType: "before_agent_start", payloadJson: JSON.stringify({ prompt: "duplicate user prompt", systemPrompt: "You are precise." }) }),
      detail({ eventId: "user", eventType: "message_end", payloadJson: JSON.stringify({ message: { role: "user", content: [{ type: "text", text: "Build it" }] } }) }),
      detail({ eventId: "assistant-tools", eventType: "message_end", timestampMs: 2, payloadJson: JSON.stringify({ message: { role: "assistant", content: [
        { type: "thinking", thinking: "Need inspect" }, { type: "toolCall", id: "call", name: "read", arguments: { path: "src/app.ts" } },
      ] } }) }),
      detail({ eventId: "start", eventType: "tool_execution_start", timestampMs: 3, toolCallId: "call", payloadJson: JSON.stringify({ toolCallId: "call", toolName: "read", args: { path: "src/app.ts" } }) }),
      detail({ eventId: "result", eventType: "tool_result", timestampMs: 4, isError: true, toolCallId: "call", payloadJson: JSON.stringify({ toolCallId: "call", toolName: "read", content: [{ type: "text", text: "file body" }], isError: true }) }),
      detail({ eventId: "answer", eventType: "message_end", payloadJson: JSON.stringify({ message: { role: "assistant", content: [{ type: "text", text: "Done" }] } }) }),
      detail({ eventId: "unknown", eventType: "turn_start", payloadJson: "{}" }),
      detail({ eventId: "malformed", eventType: "message_end", payloadJson: "{" }),
    ], 100);
    expect(items.map(item => [item.itemId, item.eventId, item.role, item.title])).toEqual([
      ["system:system", "system", "system", "System prompt"],
      ["user:0", "user", "user", "User prompt"],
      ["assistant-tools:0", "assistant-tools", "thinking", "Thinking"],
      ["tool:call", "result", "tool", "read"],
      ["answer:0", "answer", "assistant", "Assistant response"],
    ]);
    expect(items[3]).toMatchObject({
      timestampMs: 2, toolCallId: "call", toolName: "read", toolStatus: "error",
      toolInputPreview: expect.stringContaining("src/app.ts"), toolResultPreview: "file body", isError: true,
    });
    expect(new Set(items.map(item => item.itemId)).size).toBe(items.length);
  });

  it("merges tool fragments split across source pages", () => {
    const [call] = projectConversationEvents([detail({
      eventId: "call-event", eventType: "tool_execution_start", timestampMs: 10, toolCallId: "call-1",
      payloadJson: JSON.stringify({ toolCallId: "call-1", toolName: "bash", args: { command: "pwd" } }),
    })]);
    const [result] = projectConversationEvents([detail({
      eventId: "result-event", eventType: "tool_result", timestampMs: 11, toolCallId: "call-1",
      payloadJson: JSON.stringify({ toolCallId: "call-1", toolName: "bash", content: [{ type: "text", text: "/work" }], isError: false }),
    })]);
    expect(mergeConversationItems([call!, result!])).toEqual([expect.objectContaining({
      itemId: "tool:call-1", eventId: "result-event", timestampMs: 10, toolStatus: "completed",
      toolInputPreview: expect.stringContaining("pwd"), toolResultPreview: "/work",
    })]);
  });

  it("does not fabricate absent message content", () => {
    const [item] = projectConversationEvents([
      detail({ eventType: "message_end", payloadJson: JSON.stringify({ message: { role: "user", content: [] } }) }),
    ]);
    expect(item).toMatchObject({ role: "user", title: "User prompt", preview: "Content unavailable in the recorded event." });
  });
});
