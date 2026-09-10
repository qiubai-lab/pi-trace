import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TraceEnvelope } from "./events.ts";

export const DATABASE_SCHEMA_VERSION = 1;

export interface TraceStoreWriter {
  append(events: readonly TraceEnvelope[]): void;
  close(): void;
}

export interface StoredEvent {
  eventId: string;
  eventType: string;
  runtimeId: string;
  sessionId: string;
  sequence: number;
  payloadJson: string;
}

export interface StoredControl {
  id: string;
  enabled: number;
  source: string;
  timestamp: string;
}

export interface TraceEventStats {
  eventCount: number;
  payloadBytes: number;
}

export interface TracePruneResult {
  deletedEvents: number;
  deletedPayloadBytes: number;
  remainingEvents: number;
}

function number(value: unknown): number { return Number(value); }

export function traceDatabaseSize(path: string): number {
  return [path, `${path}-wal`, `${path}-shm`]
    .filter(file => existsSync(file))
    .reduce((total, file) => total + statSync(file).size, 0);
}

export class TraceStore implements TraceStoreWriter {
  readonly path: string;
  private readonly db: DatabaseSync;
  private closed = false;

  constructor(path: string, options: { readOnly?: boolean; timeoutMs?: number } = {}) {
    this.path = path;
    if (!options.readOnly) {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      chmodSync(dirname(path), 0o700);
    }
    this.db = new DatabaseSync(path, { readOnly: options.readOnly ?? false, timeout: options.timeoutMs ?? 100 });
    try {
      const version = this.schemaVersion();
      if (version > DATABASE_SCHEMA_VERSION) throw new Error(`trace database uses newer schema ${version}; supported version is ${DATABASE_SCHEMA_VERSION}`);
      if (version === 0) {
        if (options.readOnly) throw new Error("trace database has no initialized schema");
        this.initialize();
      }
      if (!options.readOnly) {
        this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
        this.secureFiles();
      }
    } catch (error) {
      this.db.close();
      this.closed = true;
      throw error;
    }
  }

  private secureFiles(): void {
    for (const file of [this.path, `${this.path}-wal`, `${this.path}-shm`]) {
      if (existsSync(file)) chmodSync(file, 0o600);
    }
  }

  private initialize(): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const version = this.schemaVersion();
      if (version > DATABASE_SCHEMA_VERSION) throw new Error(`trace database uses newer schema ${version}; supported version is ${DATABASE_SCHEMA_VERSION}`);
      if (version === 0) {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS trace_events (
            event_id TEXT PRIMARY KEY,
            schema_version INTEGER NOT NULL,
            event_type TEXT NOT NULL,
            observation_stage TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            monotonic_ns TEXT NOT NULL,
            runtime_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            session_file TEXT,
            cwd TEXT,
            provider TEXT,
            model TEXT,
            thinking_level TEXT,
            agent_run_id TEXT,
            turn_index INTEGER,
            message_id TEXT,
            tool_call_id TEXT,
            payload_json TEXT NOT NULL,
            payload_bytes INTEGER NOT NULL,
            UNIQUE(runtime_id, sequence)
          );
          CREATE INDEX IF NOT EXISTS idx_trace_events_session_time ON trace_events(session_id, timestamp_ms);
          CREATE INDEX IF NOT EXISTS idx_trace_events_runtime_sequence ON trace_events(runtime_id, sequence);
          CREATE INDEX IF NOT EXISTS idx_trace_events_tool_call ON trace_events(tool_call_id) WHERE tool_call_id IS NOT NULL;
          CREATE INDEX IF NOT EXISTS idx_trace_events_type_time ON trace_events(event_type, timestamp_ms);
          CREATE TABLE IF NOT EXISTS recording_controls (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            timestamp_ms INTEGER NOT NULL,
            enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
            source TEXT NOT NULL
          );
          PRAGMA user_version = 1;
        `);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
  }

  schemaVersion(): number {
    const row = this.db.prepare("PRAGMA user_version").get() as { user_version: number | bigint };
    return number(row.user_version);
  }

  journalMode(): string {
    const row = this.db.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
    return String(row.journal_mode).toLowerCase();
  }

  append(events: readonly TraceEnvelope[]): void {
    if (events.length === 0) return;
    const statement = this.db.prepare(`
      INSERT OR IGNORE INTO trace_events (
        event_id, schema_version, event_type, observation_stage, timestamp, timestamp_ms, monotonic_ns,
        runtime_id, session_id, sequence, session_file, cwd, provider, model, thinking_level,
        agent_run_id, turn_index, message_id, tool_call_id, payload_json, payload_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const event of events) {
        statement.run(
          event.eventId, event.schemaVersion, event.eventType, event.observationStage, event.timestamp,
          event.timestampMs, event.monotonicNs, event.runtimeId, event.sessionId, event.sequence,
          event.sessionFile ?? null, event.cwd ?? null, event.provider ?? null, event.model ?? null,
          event.thinkingLevel ?? null, event.agentRunId ?? null, event.turnIndex ?? null,
          event.messageId ?? null, event.toolCallId ?? null, event.payloadJson, event.payloadBytes,
        );
      }
      this.db.exec("COMMIT");
      this.secureFiles();
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
  }

  appendControl(enabled: boolean, source: string): void {
    const timestampMs = Date.now();
    this.db.prepare("INSERT INTO recording_controls (id, timestamp, timestamp_ms, enabled, source) VALUES (?, ?, ?, ?, ?)")
      .run(randomUUID(), new Date(timestampMs).toISOString(), timestampMs, enabled ? 1 : 0, source);
  }

  countEvents(): number {
    const row = this.db.prepare("SELECT count(*) AS count FROM trace_events").get() as { count: number | bigint };
    return number(row.count);
  }

  eventStats(beforeTimestampMs?: number): TraceEventStats {
    const sql = beforeTimestampMs === undefined
      ? "SELECT count(*) AS count, coalesce(sum(payload_bytes), 0) AS payload_bytes FROM trace_events"
      : "SELECT count(*) AS count, coalesce(sum(payload_bytes), 0) AS payload_bytes FROM trace_events WHERE timestamp_ms < ?";
    const row = (beforeTimestampMs === undefined
      ? this.db.prepare(sql).get()
      : this.db.prepare(sql).get(beforeTimestampMs)) as { count: number | bigint; payload_bytes: number | bigint };
    return { eventCount: number(row.count), payloadBytes: number(row.payload_bytes) };
  }

  pruneEvents(beforeTimestampMs?: number): TracePruneResult {
    const predicate = beforeTimestampMs === undefined ? "" : " WHERE timestamp_ms < ?";
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const selected = this.eventStats(beforeTimestampMs);
      const statement = this.db.prepare(`DELETE FROM trace_events${predicate}`);
      const result = beforeTimestampMs === undefined ? statement.run() : statement.run(beforeTimestampMs);
      const deletedEvents = number(result.changes);
      if (deletedEvents !== selected.eventCount) {
        throw new Error(`prune count changed during transaction: selected ${selected.eventCount}, deleted ${deletedEvents}`);
      }
      const remainingEvents = this.countEvents();
      this.db.exec("COMMIT");
      this.secureFiles();
      return { deletedEvents, deletedPayloadBytes: selected.payloadBytes, remainingEvents };
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* original error wins */ }
      throw error;
    }
  }

  checkpointAndVacuum(): void {
    this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    this.db.exec("VACUUM");
    this.secureFiles();
  }

  listEvents(sessionId?: string): StoredEvent[] {
    const sql = sessionId
      ? "SELECT event_id, event_type, runtime_id, session_id, sequence, payload_json FROM trace_events WHERE session_id = ? ORDER BY timestamp_ms, runtime_id, sequence"
      : "SELECT event_id, event_type, runtime_id, session_id, sequence, payload_json FROM trace_events ORDER BY timestamp_ms, runtime_id, sequence";
    const rows = (sessionId ? this.db.prepare(sql).all(sessionId) : this.db.prepare(sql).all()) as Array<Record<string, unknown>>;
    return rows.map(row => ({
      eventId: String(row.event_id), eventType: String(row.event_type), runtimeId: String(row.runtime_id),
      sessionId: String(row.session_id), sequence: number(row.sequence), payloadJson: String(row.payload_json),
    }));
  }

  listControls(): StoredControl[] {
    return (this.db.prepare("SELECT id, enabled, source, timestamp FROM recording_controls ORDER BY timestamp_ms, rowid").all() as Array<Record<string, unknown>>)
      .map(row => ({ id: String(row.id), enabled: number(row.enabled), source: String(row.source), timestamp: String(row.timestamp) }));
  }

  sizeBytes(): number { return traceDatabaseSize(this.path); }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }
}
