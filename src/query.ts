import {
  TraceStore,
  type StoredControl,
  type StoredEvent,
  type TraceEventDetail,
  type TraceEventFilters,
  type TraceEventSummary,
  type TraceEventTypeStat,
  type TraceOverview,
  type TraceSessionSummary,
} from "./store.ts";

export interface CursorPage<T> { items: T[]; nextCursor?: string; }

type Cursor =
  | { kind: "sessions"; lastTimestampMs: number; sessionId: string }
  | { kind: "events"; timestampMs: number; eventId: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string | undefined, kind: Cursor["kind"]): Cursor | undefined {
  if (!value) return undefined;
  if (value.length > 512) throw new Error("invalid cursor");
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (cursor.kind !== kind) throw new Error();
    if (kind === "sessions" && typeof (cursor as any).lastTimestampMs === "number" && typeof (cursor as any).sessionId === "string") return cursor as Cursor;
    if (kind === "events" && typeof (cursor as any).timestampMs === "number" && typeof (cursor as any).eventId === "string") return cursor as Cursor;
  } catch { /* normalized below */ }
  throw new Error("invalid cursor");
}

/** Read-only boundary used by status and the local Web service. */
export class TraceQueryService {
  private readonly store: TraceStore;

  constructor(databasePath: string) {
    this.store = new TraceStore(databasePath, { readOnly: true });
  }

  schemaVersion(): number { return this.store.schemaVersion(); }
  countEvents(): number { return this.store.countEvents(); }
  overview(): TraceOverview { return this.store.overview(); }
  eventTypeStats(): TraceEventTypeStat[] { return this.store.eventTypeStats(); }

  sessions(limit: number, cursorValue?: string): CursorPage<TraceSessionSummary> {
    const cursor = decodeCursor(cursorValue, "sessions") as Extract<Cursor, { kind: "sessions" }> | undefined;
    const rows = this.store.listSessionSummaries(limit + 1, cursor);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last
        ? encodeCursor({ kind: "sessions", lastTimestampMs: last.lastTimestampMs, sessionId: last.sessionId })
        : undefined,
    };
  }

  events(filters: TraceEventFilters, limit: number, cursorValue?: string): CursorPage<TraceEventSummary> {
    const cursor = decodeCursor(cursorValue, "events") as Extract<Cursor, { kind: "events" }> | undefined;
    const rows = this.store.listEventSummaries({ ...filters, before: cursor }, limit + 1);
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last
        ? encodeCursor({ kind: "events", timestampMs: last.timestampMs, eventId: last.eventId })
        : undefined,
    };
  }

  eventsAfter(filters: TraceEventFilters, limit: number, cursorValue?: string): CursorPage<TraceEventSummary> {
    const cursor = decodeCursor(cursorValue, "events") as Extract<Cursor, { kind: "events" }> | undefined;
    const items = this.store.listEventSummaries({ ...filters, after: cursor }, limit, true);
    const last = items.at(-1);
    return {
      items,
      nextCursor: last ? encodeCursor({ kind: "events", timestampMs: last.timestampMs, eventId: last.eventId }) : cursorValue,
    };
  }

  eventDetail(eventId: string): TraceEventDetail | undefined { return this.store.getEventDetail(eventId); }
  listSessionEvents(sessionId: string): StoredEvent[] { return this.store.listEvents(sessionId); }
  listRecordingControls(): StoredControl[] { return this.store.listControls(); }
  close(): void { this.store.close(); }
}
