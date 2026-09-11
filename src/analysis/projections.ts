import type { ConversationItemDto, ConversationRole, TimelineEventDto, TraceEventDetail, TraceEventSummary } from "../contracts.ts";

export const CONVERSATION_PREVIEW_CHARS = 4_000;

export function projectTimelineEvents(events: readonly TraceEventSummary[]): TimelineEventDto[] {
  return events.map(event => {
    const runKey = event.agentRunId ?? `session:${event.sessionId}`;
    const turnKey = event.turnIndex === undefined ? `${runKey}:unscoped` : `${runKey}:turn:${event.turnIndex}`;
    return {
      ...event,
      runKey,
      turnKey,
      hierarchyDepth: event.agentRunId ? (event.turnIndex === undefined ? 1 : 2) : 0,
    };
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function textFromContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.flatMap(block => {
    const item = record(block);
    if (!item) return [];
    if (typeof item.text === "string") return [item.text];
    if (typeof item.thinking === "string") return [item.thinking];
    return [];
  }).join("\n");
}

function printable(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function truncate(value: string, limit: number): { preview: string; truncated: boolean } {
  if (value.length <= limit) return { preview: value, truncated: false };
  return { preview: `${value.slice(0, limit)}\n…`, truncated: true };
}

interface ProjectedBlock {
  suffix: string; role: ConversationRole; title: string; text: string;
  toolCallId?: string; toolName?: string; toolStatus?: "pending" | "completed" | "error";
  toolInput?: string; toolResult?: string;
}

function messageProjection(payload: Record<string, unknown>): ProjectedBlock[] {
  const message = record(payload.message);
  if (!message) return [];
  const rawRole = message.role;
  if (rawRole === "toolResult") return [];
  const role: ConversationRole = rawRole === "user" ? "user" : rawRole === "assistant" ? "assistant" : "system";
  const content = message.content;
  if (!Array.isArray(content)) {
    return [{ suffix: "0", role, title: role === "user" ? "User prompt" : role === "assistant" ? "Assistant response" : "System message", text: textFromContent(content) }];
  }
  const blocks = content.flatMap((value, index): ProjectedBlock[] => {
    const item = record(value);
    if (!item) return [];
    if (typeof item.thinking === "string") return [{ suffix: String(index), role: "thinking", title: "Thinking", text: item.thinking }];
    if (item.type === "toolCall") {
      const name = typeof item.name === "string" ? item.name : "Tool";
      const toolCallId = typeof item.id === "string" ? item.id : undefined;
      const input = printable(item.arguments);
      return [{ suffix: String(index), role: "tool", title: name, text: input, toolCallId, toolName: name, toolStatus: "pending", toolInput: input }];
    }
    if (typeof item.text === "string") return [{ suffix: String(index), role, title: role === "user" ? "User prompt" : role === "assistant" ? "Assistant response" : "System message", text: item.text }];
    return [];
  });
  return blocks.length ? blocks : [{ suffix: "0", role, title: role === "user" ? "User prompt" : role === "assistant" ? "Assistant response" : "System message", text: "" }];
}

function projection(event: TraceEventDetail): ProjectedBlock[] {
  let payload: Record<string, unknown>;
  try { payload = record(JSON.parse(event.payloadJson)) ?? {}; } catch { return []; }
  if (event.eventType === "message_end") return messageProjection(payload);
  if (event.eventType === "before_agent_start" && typeof payload.systemPrompt === "string") {
    return [{ suffix: "system", role: "system", title: "System prompt", text: payload.systemPrompt }];
  }
  if (event.eventType === "user_bash" && typeof payload.command === "string") {
    return [{ suffix: "shell", role: "user", title: "Shell input", text: payload.command }];
  }
  if (event.eventType === "tool_execution_start") {
    const name = typeof payload.toolName === "string" ? payload.toolName : "Tool";
    const toolCallId = typeof payload.toolCallId === "string" ? payload.toolCallId : event.toolCallId;
    const input = printable(payload.args);
    return [{ suffix: "start", role: "tool", title: name, text: input, toolCallId, toolName: name, toolStatus: "pending", toolInput: input }];
  }
  if (event.eventType === "tool_result") {
    const name = typeof payload.toolName === "string" ? payload.toolName : "Tool";
    const toolCallId = typeof payload.toolCallId === "string" ? payload.toolCallId : event.toolCallId;
    const result = textFromContent(payload.content) || printable(payload.details) || "Content unavailable in the recorded event.";
    const isError = event.isError || payload.isError === true;
    return [{ suffix: "result", role: "tool", title: name, text: result, toolCallId, toolName: name, toolStatus: isError ? "error" : "completed", toolResult: result }];
  }
  return [];
}

export function mergeConversationItems(items: readonly ConversationItemDto[]): ConversationItemDto[] {
  const merged = new Map<string, ConversationItemDto>();
  for (const item of items) {
    const previous = merged.get(item.itemId);
    if (!previous || item.role !== "tool") { merged.set(item.itemId, item); continue; }
    const hasResult = item.toolResultPreview !== undefined;
    const toolInputPreview = previous.toolInputPreview ?? item.toolInputPreview;
    const toolResultPreview = item.toolResultPreview ?? previous.toolResultPreview;
    const toolStatus = previous.toolStatus === "error" || item.toolStatus === "error"
      ? "error" : toolResultPreview !== undefined ? "completed" : "pending";
    merged.set(item.itemId, {
      ...previous,
      ...(hasResult ? {
        eventId: item.eventId, eventType: item.eventType, isError: item.isError,
        agentRunId: item.agentRunId, turnIndex: item.turnIndex,
      } : {}),
      title: previous.toolName ?? item.toolName ?? previous.title,
      preview: [toolInputPreview && `Input\n${toolInputPreview}`, toolResultPreview && `Result\n${toolResultPreview}`].filter(Boolean).join("\n\n"),
      truncated: previous.truncated || item.truncated,
      isError: previous.isError || item.isError,
      toolCallId: previous.toolCallId ?? item.toolCallId,
      toolName: previous.toolName ?? item.toolName,
      toolStatus,
      toolInputPreview,
      toolResultPreview,
    });
  }
  return [...merged.values()];
}

export function projectConversationEvents(
  events: readonly TraceEventDetail[],
  previewChars = CONVERSATION_PREVIEW_CHARS,
): ConversationItemDto[] {
  const items: ConversationItemDto[] = [];
  for (const event of events) {
    for (const projected of projection(event)) {
      const { preview, truncated } = truncate(projected.text || "Content unavailable in the recorded event.", previewChars);
      const toolInputPreview = projected.toolInput === undefined ? undefined : truncate(projected.toolInput, previewChars).preview;
      const toolResultPreview = projected.toolResult === undefined ? undefined : truncate(projected.toolResult, previewChars).preview;
      items.push({
        itemId: projected.toolCallId ? `tool:${projected.toolCallId}` : `${event.eventId}:${projected.suffix}`,
        eventId: event.eventId,
        eventType: event.eventType,
        timestamp: event.timestamp,
        timestampMs: event.timestampMs,
        role: projected.role,
        title: projected.title,
        preview: projected.role === "tool"
          ? [toolInputPreview && `Input\n${toolInputPreview}`, toolResultPreview && `Result\n${toolResultPreview}`].filter(Boolean).join("\n\n")
          : preview,
        truncated,
        isError: event.isError,
        toolCallId: projected.toolCallId ?? event.toolCallId,
        toolName: projected.toolName,
        toolStatus: projected.toolStatus,
        toolInputPreview,
        toolResultPreview,
        agentRunId: event.agentRunId,
        turnIndex: event.turnIndex,
      });
    }
  }
  return mergeConversationItems(items);
}
