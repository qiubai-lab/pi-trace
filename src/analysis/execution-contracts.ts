export type OperationKind =
  | "run"
  | "turn"
  | "request"
  | "tool"
  | "user"
  | "assistant"
  | "thinking"
  | "system"
  | "wait"
  | "compaction"
  | "span"
  | "gap";
export type OperationStatus =
  | "observed"
  | "running"
  | "completed"
  | "error"
  | "incomplete";
export interface Operation {
  id: string;
  sessionId: string;
  runtimeId: string;
  parentId?: string;
  kind: OperationKind;
  name: string;
  summary: string;
  status: OperationStatus;
  start: number;
  end?: number;
  startSequence: number;
  revision: number;
  eventCount: number;
  source: string;
  inputEventId?: string;
  resultEventId?: string;
  contentEventId?: string;
  blockIndex?: number;
  lastEventId: string;
  lastEventType: string;
  toolCallId?: string;
  agentRunId?: string;
  turnIndex?: number;
  incompleteStart: boolean;
  durationLabel: string;
}
export interface ExecutionFilters {
  sessionId: string;
  view?: "execution" | "conversation" | "events";
  search?: string;
  kind?: string;
  status?: string;
  parentId?: string;
  from?: number;
  to?: number;
  at?: number;
  offset?: number;
  limit?: number;
  focus?: string;
}
export interface ExecutionEvent {
  id: string;
  operationId?: string;
  type: string;
  timestamp: number;
  sequence: number;
  runtimeId: string;
  revision: number;
}
export interface ExecutionPage {
  items: Operation[];
  events?: ExecutionEvent[];
  total: number;
  offset: number;
  limit: number;
  revision: number;
  overview: {
    start: number;
    end: number;
    events: number;
    operations: number;
    errors: number;
    gaps: number;
    bins: number[];
  };
  groups: { id: string; name: string; kind: string; parentId?: string }[];
  indexing: boolean;
}
export interface ContentSection {
  id: string;
  label: string;
  format: "markdown" | "json" | "text" | "diff" | "image";
  text: string;
  before?: string;
  after?: string;
  mime?: string;
  truncated?: boolean;
  totalChars?: number;
  eventId: string;
}
export interface OperationDetail {
  operation: Operation;
  sections: ContentSection[];
  events: ExecutionEvent[];
  totalEvents: number;
  relations: { id: string; name: string; relation: string }[];
  warnings: string[];
}
export interface RawSlice {
  eventId: string;
  eventType: string;
  observationStage: string;
  text: string;
  offset: number;
  totalChars: number;
  masked: boolean;
}
export interface ExecutionChange {
  cursor: string;
  revision: number;
  reset: boolean;
}
