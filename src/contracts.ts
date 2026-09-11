export interface CursorPage<T> { items: T[]; nextCursor?: string; }

export interface TraceOverview {
  eventCount: number;
  payloadBytes: number;
  earliestTimestamp?: string;
  latestTimestamp?: string;
}

export interface TraceSessionSummary {
  sessionId: string;
  sessionFile?: string;
  cwd?: string;
  provider?: string;
  model?: string;
  eventCount: number;
  payloadBytes: number;
  firstTimestamp: string;
  lastTimestamp: string;
  lastTimestampMs: number;
  agentRuns: number;
  turns: number;
  toolCalls: number;
  errors: number;
}

export interface TraceEventSummary {
  eventId: string;
  eventType: string;
  timestamp: string;
  timestampMs: number;
  runtimeId: string;
  sessionId: string;
  sequence: number;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  agentRunId?: string;
  turnIndex?: number;
  messageId?: string;
  toolCallId?: string;
  payloadBytes: number;
  isError: boolean;
}

export interface TraceEventDetail extends TraceEventSummary {
  observationStage: string;
  sessionFile?: string;
  cwd?: string;
  monotonicNs: string;
  payloadJson: string;
}

export interface TraceEventFilters {
  sessionId?: string;
  eventType?: string;
  runtimeId?: string;
  agentRunId?: string;
  turnIndex?: number;
  toolCallId?: string;
  provider?: string;
  model?: string;
  fromTimestampMs?: number;
  toTimestampMs?: number;
  before?: { timestampMs: number; eventId: string };
  after?: { timestampMs: number; eventId: string };
  eventTypes?: string[];
}

export interface TraceEventTypeStat { eventType: string; eventCount: number; payloadBytes: number; }
export interface SessionSummaryDto extends TraceSessionSummary {}
export interface TimelineEventDto extends TraceEventSummary { runKey: string; turnKey: string; hierarchyDepth: 0 | 1 | 2; }
export type ConversationRole = "user" | "assistant" | "thinking" | "tool" | "system";
export interface ConversationItemDto {
  itemId: string; eventId: string; eventType: string; timestamp: string; timestampMs: number; role: ConversationRole;
  title: string; preview: string; truncated: boolean; isError: boolean; toolCallId?: string;
  toolName?: string; toolStatus?: "pending" | "completed" | "error"; toolInputPreview?: string; toolResultPreview?: string;
  agentRunId?: string; turnIndex?: number;
}
export interface EventDetailDto extends TraceEventDetail {}
