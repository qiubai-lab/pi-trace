export type {
  ConversationItemDto as ConversationItem,
  CursorPage,
  EventDetailDto as EventDetail,
  SessionSummaryDto as SessionSummary,
} from "../contracts.ts";

export interface Status {
  recording: boolean;
  schemaVersion: number;
  databaseSizeBytes: number;
  overview: { eventCount: number; payloadBytes: number; earliestTimestamp?: string; latestTimestamp?: string };
  diagnostics: { droppedEvents: number; storageErrors: number };
}
