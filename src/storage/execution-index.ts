import { chmodSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { TraceEventDetail } from "../contracts.ts";
import {
  ExecutionProjector,
  type ProjectorState,
} from "../analysis/execution.ts";
import type {
  ExecutionFilters,
  ExecutionPage,
  ExecutionEvent,
  Operation,
} from "../analysis/execution-contracts.ts";

const VERSION = 4;
export function rawEvent(row: Record<string, any>): TraceEventDetail {
  return {
    eventId: row.event_id,
    eventType: row.event_type,
    timestamp: row.timestamp,
    timestampMs: row.timestamp_ms,
    runtimeId: row.runtime_id,
    sessionId: row.session_id,
    sequence: row.sequence,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    agentRunId: row.agent_run_id ?? undefined,
    turnIndex: row.turn_index ?? undefined,
    messageId: row.message_id ?? undefined,
    toolCallId: row.tool_call_id ?? undefined,
    payloadBytes: row.payload_bytes,
    isError: false,
    observationStage: row.observation_stage,
    monotonicNs: row.monotonic_ns,
    payloadJson: row.payload_json,
    cwd: row.cwd,
    thinkingLevel: row.thinking_level,
  };
}
/** Disposable derived DB. Raw database is always opened read-only; schema 1 is untouched. */
export class ExecutionIndex {
  private raw: DatabaseSync;
  private db: DatabaseSync;
  private projector = new ExecutionProjector();
  private dataVersion = -1;
  private historyKey = "";
  private identity = "";
  revision = 0;
  epoch = "";
  indexing = false;
  constructor(
    readonly path: string,
    indexPath = `${path}.execution.sqlite`,
  ) {
    this.raw = new DatabaseSync(path, { readOnly: true, timeout: 100 });
    this.identity = `${statSync(path).dev}:${statSync(path).ino}`;
    mkdirSync(dirname(indexPath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(indexPath, { timeout: 100 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, session TEXT, kind TEXT, status TEXT, parent TEXT, start REAL, end REAL, sequence INTEGER, runtime TEXT, search TEXT, data TEXT);
      CREATE INDEX IF NOT EXISTS op_session_time ON operations(session,start,runtime,sequence,id);
      CREATE INDEX IF NOT EXISTS op_parent ON operations(session,parent);
      CREATE TABLE IF NOT EXISTS revisions(op TEXT, revision INTEGER, session TEXT, time REAL, data TEXT, PRIMARY KEY(op,revision));
      CREATE INDEX IF NOT EXISTS rev_time ON revisions(session,time,op,revision);
      CREATE INDEX IF NOT EXISTS rev_latest ON revisions(session,op,revision DESC,time);
      CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, session TEXT, revision INTEGER UNIQUE, time REAL, type TEXT, runtime TEXT, sequence INTEGER, op TEXT);
      CREATE INDEX IF NOT EXISTS ev_session_time ON events(session,time,runtime,sequence);
      CREATE INDEX IF NOT EXISTS ev_op ON events(op,revision);
      CREATE INDEX IF NOT EXISTS ev_session_revision ON events(session,revision);
      CREATE TABLE IF NOT EXISTS evidence(op TEXT, event TEXT, revision INTEGER, PRIMARY KEY(op,event));
      CREATE INDEX IF NOT EXISTS evidence_event ON evidence(event,op);
      CREATE TABLE IF NOT EXISTS artifacts(op TEXT, event TEXT, time REAL, revision INTEGER, PRIMARY KEY(op,event));
      CREATE VIRTUAL TABLE IF NOT EXISTS content_search USING fts5(event UNINDEXED, session UNINDEXED, time UNINDEXED, body, tokenize='trigram');
    `);
    for (const file of [indexPath, `${indexPath}-wal`, `${indexPath}-shm`])
      if (existsSync(file)) chmodSync(file, 0o600);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (this.meta("version") !== String(VERSION)) this.reset();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.db.close();
      this.raw.close();
      throw error;
    }
    this.restoreCheckpoint();
  }
  private meta(key: string): string | undefined {
    return (
      this.db.prepare("SELECT value FROM meta WHERE key=?").get(key) as any
    )?.value;
  }
  private setMeta(key: string, value: string): void {
    this.db.prepare("INSERT OR REPLACE INTO meta VALUES (?,?)").run(key, value);
  }
  private restoreCheckpoint(): void {
    const revision = Number(this.meta("revision") ?? 0);
    const epoch = this.meta("epoch") ?? "";
    if (revision !== this.revision || epoch !== this.epoch) {
      const state = this.meta("projector");
      this.projector = new ExecutionProjector(
        state ? (JSON.parse(state) as ProjectorState) : undefined,
      );
      this.revision = revision;
      this.epoch = epoch;
      this.historyKey = "";
    }
  }
  private reset(): void {
    this.db.exec(
      "DELETE FROM operations; DELETE FROM revisions; DELETE FROM events; DELETE FROM evidence; DELETE FROM content_search; DELETE FROM artifacts; DELETE FROM meta;",
    );
    this.projector = new ExecutionProjector();
    this.revision = 0;
    this.epoch = randomUUID();
    this.setMeta("version", String(VERSION));
    this.setMeta("epoch", this.epoch);
  }
  /** Incremental bounded catch-up; caller yields between batches. Checkpoint validates pruning/replacement. */
  sync(batchSize = 500): boolean {
    const stat = statSync(this.path);
    const identity = `${stat.dev}:${stat.ino}`;
    if (identity !== this.identity) {
      this.raw.close();
      this.raw = new DatabaseSync(this.path, { readOnly: true, timeout: 100 });
      this.identity = identity;
      this.dataVersion = -1;
    }
    const version = Number(
      (this.raw.prepare("PRAGMA data_version").get() as any).data_version,
    );
    this.restoreCheckpoint();
    if (version === this.dataVersion && !this.indexing) return false;
    this.historyKey = "";
    let rows: Record<string, any>[] = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Multiple Web servers may share this cache. Re-read the durable reducer cursor under the write lock.
      this.restoreCheckpoint();
      const indexed = Number(
        (this.db.prepare("SELECT count(*) n FROM events").get() as any).n,
      );
      const priorCount = Number(
        (
          this.raw
            .prepare("SELECT count(*) n FROM trace_events WHERE rowid<=?")
            .get(this.revision) as any
        ).n,
      );
      const checkpoint = this.raw
        .prepare("SELECT event_id FROM trace_events WHERE rowid=?")
        .get(this.revision) as any;
      if (
        indexed !== priorCount ||
        (this.revision && checkpoint?.event_id !== this.meta("lastEvent"))
      )
        this.reset();
      rows = this.raw
        .prepare(
          "SELECT rowid ingest, * FROM trace_events WHERE rowid>? ORDER BY rowid LIMIT ?",
        )
        .all(this.revision, batchSize) as Record<string, any>[];
      for (const row of rows) {
        const e = rawEvent(row);
        const rev = Number(row.ingest);
        const updates = this.projector.project(
          e,
          rev,
          (id) => this.operation(id),
          () =>
            (
              this.db
                .prepare(
                  "SELECT data FROM operations WHERE session=? AND runtime=? AND status='running'",
                )
                .all(e.sessionId, e.runtimeId) as any[]
            ).map((row) => JSON.parse(row.data)),
        );
        for (const op of updates) {
          const data = JSON.stringify(op);
          const search =
            `${op.name} ${op.summary} ${op.source} ${op.lastEventType}`.toLowerCase();
          this.db
            .prepare(
              "INSERT OR REPLACE INTO operations VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            )
            .run(
              op.id,
              op.sessionId,
              op.kind,
              op.status,
              op.parentId ?? null,
              op.start,
              op.end ?? null,
              op.startSequence,
              op.runtimeId,
              search,
              data,
            );
          this.db
            .prepare("INSERT OR REPLACE INTO revisions VALUES (?,?,?,?,?)")
            .run(op.id, rev, e.sessionId, e.timestampMs, data);
          this.db
            .prepare("INSERT OR IGNORE INTO evidence VALUES (?,?,?)")
            .run(op.id, e.eventId, rev);
          if (
            e.eventType === "qb_span" &&
            JSON.parse(e.payloadJson).action === "artifact.attach"
          )
            this.db
              .prepare("INSERT OR IGNORE INTO artifacts VALUES (?,?,?,?)")
              .run(op.id, e.eventId, e.timestampMs, rev);
        }
        if (
          updates.length &&
          [
            "message_end",
            "tool_result",
            "tool_execution_end",
            "before_agent_start",
            "context",
            "qb_span",
            "trace_resources",
          ].includes(e.eventType)
        ) {
          this.db
            .prepare(
              "INSERT INTO content_search(event,session,time,body) VALUES (?,?,?,?)",
            )
            .run(e.eventId, e.sessionId, e.timestampMs, e.payloadJson);
        }
        // Final toolResult messages remain accessible as raw events; don't invent another operation.
        this.db
          .prepare("INSERT OR REPLACE INTO events VALUES (?,?,?,?,?,?,?,?)")
          .run(
            e.eventId,
            e.sessionId,
            rev,
            e.timestampMs,
            e.eventType,
            e.runtimeId,
            e.sequence,
            updates.at(-1)?.id ?? null,
          );
        this.revision = rev;
        this.setMeta("lastEvent", e.eventId);
      }
      this.setMeta("revision", String(this.revision));
      this.setMeta("projector", JSON.stringify(this.projector.state));
      this.db.exec("COMMIT");
      this.dataVersion = version;
    } catch (error) {
      this.db.exec("ROLLBACK");
      this.dataVersion = -1;
      this.revision = -1;
      this.restoreCheckpoint();
      throw error;
    }
    this.indexing = rows.length === batchSize;
    return this.indexing;
  }
  operation(id: string, at?: number): Operation | undefined {
    const row =
      at === undefined
        ? this.db.prepare("SELECT data FROM operations WHERE id=?").get(id)
        : this.db
            .prepare(
              "SELECT data FROM revisions WHERE op=? AND time<=? ORDER BY revision DESC LIMIT 1",
            )
            .get(id, at);
    return row ? JSON.parse(String((row as any).data)) : undefined;
  }
  event(id: string): TraceEventDetail | undefined {
    const row = this.raw
      .prepare("SELECT * FROM trace_events WHERE event_id=?")
      .get(id);
    return row ? rawEvent(row) : undefined;
  }
  resolveEvent(id: string): string | undefined {
    return (
      (this.db.prepare("SELECT op FROM events WHERE id=?").get(id) as any)
        ?.op ?? undefined
    );
  }
  evidence(
    id: string,
    at?: number,
    offset = 0,
    limit = 100,
  ): { items: ExecutionEvent[]; total: number } {
    const where = "WHERE x.op=?" + (at === undefined ? "" : " AND e.time<=?");
    const args = at === undefined ? [id] : [id, at];
    const join = `FROM evidence x JOIN events e ON e.id=x.event ${where}`;
    const total = Number(
      (this.db.prepare(`SELECT count(*) n ${join}`).get(...args) as any).n,
    );
    const rows = this.db
      .prepare(`SELECT e.* ${join} ORDER BY e.revision LIMIT ? OFFSET ?`)
      .all(...args, limit, offset);
    return { items: rows.map(eventDto), total };
  }
  children(id: string, at?: number): Operation[] {
    if (at !== undefined)
      this.materializeHistory(this.operation(id, at)?.sessionId ?? "", at);
    return (
      this.db
        .prepare(
          `SELECT data FROM ${at === undefined ? "operations" : "history"} WHERE parent=? ORDER BY start,sequence LIMIT 30`,
        )
        .all(id) as any[]
    ).map((row) => JSON.parse(row.data));
  }
  artifactEvents(id: string, at?: number): string[] {
    return (
      this.db
        .prepare(
          "SELECT event FROM artifacts WHERE op=? AND time<=? ORDER BY revision LIMIT 16",
        )
        .all(id, at ?? Number.MAX_SAFE_INTEGER) as any[]
    ).map((row) => row.event);
  }
  previousContent(op: Operation, at?: number): TraceEventDetail | undefined {
    const row = this.db
      .prepare(
        "SELECT id FROM events WHERE session=? AND type=? AND revision<? AND time<=? ORDER BY revision DESC LIMIT 1",
      )
      .get(
        op.sessionId,
        op.lastEventType,
        op.revision,
        at ?? Number.MAX_SAFE_INTEGER,
      ) as any;
    return row ? this.event(row.id) : undefined;
  }
  page(f: ExecutionFilters): ExecutionPage {
    const limit = Math.min(200, Math.max(1, f.limit ?? 100));
    let offset = Math.max(0, f.offset ?? 0);
    // Historical snapshots are derived exclusively from revisions at or before the cutoff.
    const historical = f.at !== undefined;
    if (historical) this.materializeHistory(f.sessionId, f.at!);
    const prefix = "";
    const source = historical ? "history" : "operations";
    const base: (string | number)[] = [];
    const args: (string | number)[] = [...base, f.sessionId];
    const clauses = ["session=?"];
    if (f.search) {
      clauses.push(
        "(instr(search,?)>0 OR id IN (SELECT x.op FROM content_search c JOIN evidence x ON x.event=c.event WHERE c.session=? AND c.time<=? AND c.body LIKE ? ESCAPE '\\'))",
      );
      args.push(
        f.search.toLowerCase(),
        f.sessionId,
        f.at ?? Number.MAX_SAFE_INTEGER,
        `%${f.search.replace(/[\\%_]/g, (character) => `\\${character}`)}%`,
      );
    }
    if (f.kind) {
      clauses.push("kind=?");
      args.push(f.kind);
    }
    if (f.status) {
      clauses.push("status=?");
      args.push(f.status);
    }
    if (f.parentId) {
      clauses.push(
        `id IN (WITH RECURSIVE descendants(id) AS (SELECT id FROM ${source} WHERE id=? UNION SELECT child.id FROM ${source} child JOIN descendants d ON child.parent=d.id) SELECT id FROM descendants)`,
      );
      args.push(f.parentId);
    }
    if (f.from !== undefined) {
      clauses.push("coalesce(end,start)>=?");
      args.push(f.from);
    }
    if (f.to !== undefined) {
      clauses.push("start<=?");
      args.push(f.to);
    }
    if (f.view === "conversation")
      clauses.push("kind IN ('user','assistant','thinking','tool','system')");
    const where = clauses.join(" AND ");
    const order = "start,runtime,sequence,id";
    if (f.focus) {
      const resolved =
        f.focus === "@playhead"
          ? (
              this.db
                .prepare(
                  `${prefix}SELECT id FROM ${source} WHERE ${where} ORDER BY start DESC,runtime DESC,sequence DESC,id DESC LIMIT 1`,
                )
                .get(...args) as any
            )?.id
          : this.operation(f.focus, f.at)
            ? f.focus
            : this.resolveEvent(f.focus);
      if (resolved) {
        const row = this.db
          .prepare(
            `${prefix}SELECT position FROM (SELECT id,row_number() OVER (ORDER BY ${order})-1 position FROM ${source} WHERE ${where}) WHERE id=?`,
          )
          .get(...args, resolved) as any;
        if (row)
          offset = Math.max(
            0,
            Math.floor(Number(row.position) / limit) * limit,
          );
      }
    }
    let total = Number(
      (
        this.db
          .prepare(`${prefix}SELECT count(*) n FROM ${source} WHERE ${where}`)
          .get(...args) as any
      ).n,
    );
    let items = (
      this.db
        .prepare(
          `${prefix}SELECT data FROM ${source} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`,
        )
        .all(...args, limit, offset) as any[]
    ).map((row) => JSON.parse(row.data) as Operation);
    const stats = this.db
      .prepare(
        `${prefix}SELECT min(start) start,max(coalesce(end,start)) end,count(*) operations,sum(kind NOT IN ('run','turn') AND status='error') errors,sum(kind='gap') gaps FROM ${source} WHERE session=?`,
      )
      .get(...base, f.sessionId) as any;
    const eventCount = Number(
      (
        this.db
          .prepare("SELECT count(*) n FROM events WHERE session=? AND time<=?")
          .get(f.sessionId, f.at ?? Number.MAX_SAFE_INTEGER) as any
      ).n,
    );
    const bins = Array<number>(64).fill(0);
    const duration = Math.max(1, Number(stats.end) - Number(stats.start));
    const activity = this.db
      .prepare(
        "SELECT min(63,max(0,cast((time-?)*64.0/? AS INTEGER))) bucket,count(*) n FROM events WHERE session=? AND time<=? GROUP BY bucket",
      )
      .all(
        stats.start ?? 0,
        duration,
        f.sessionId,
        f.at ?? Number.MAX_SAFE_INTEGER,
      ) as any[];
    for (const bin of activity) bins[Number(bin.bucket)] = Number(bin.n);
    const groups = (
      this.db
        .prepare(
          `${prefix}SELECT id,kind,parent,json_extract(data,'$.name') name FROM ${source} WHERE session=? AND kind IN ('run','turn') ORDER BY ${order} LIMIT 500`,
        )
        .all(...base, f.sessionId) as any[]
    ).map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      parentId: row.parent ?? undefined,
    }));
    let events: ExecutionEvent[] | undefined;
    if (f.view === "events") {
      const ec = ["session=?", "time<=?"];
      const ea: (string | number)[] = [
        f.sessionId,
        f.at ?? Number.MAX_SAFE_INTEGER,
      ];
      if (f.search) {
        ec.push("(instr(lower(type),?)>0 OR instr(lower(id),?)>0)");
        ea.push(f.search.toLowerCase(), f.search.toLowerCase());
      }
      if (f.from !== undefined) {
        ec.push("time>=?");
        ea.push(f.from);
      }
      if (f.to !== undefined) {
        ec.push("time<=?");
        ea.push(f.to);
      }
      if (f.focus && f.focus !== "@playhead") {
        const target = this.operation(f.focus, f.at)?.lastEventId ?? f.focus;
        const position = this.db
          .prepare(
            `SELECT position FROM (SELECT id,row_number() OVER (ORDER BY time,runtime,sequence,id)-1 position FROM events WHERE ${ec.join(" AND ")}) WHERE id=?`,
          )
          .get(...ea, target) as any;
        if (position)
          offset = Math.floor(Number(position.position) / limit) * limit;
      }
      total = Number(
        (
          this.db
            .prepare(`SELECT count(*) n FROM events WHERE ${ec.join(" AND ")}`)
            .get(...ea) as any
        ).n,
      );
      events = this.db
        .prepare(
          `SELECT * FROM events WHERE ${ec.join(" AND ")} ORDER BY time,runtime,sequence,id LIMIT ? OFFSET ?`,
        )
        .all(...ea, limit, offset)
        .map(eventDto);
      items = [];
    }
    return {
      items,
      events,
      total,
      offset,
      limit,
      revision: this.revision,
      indexing: this.indexing,
      groups,
      overview: {
        start: Number(stats.start ?? 0),
        end: Number(stats.end ?? 0),
        events: eventCount,
        operations: Number(stats.operations ?? 0),
        errors: Number(stats.errors ?? 0),
        gaps: Number(stats.gaps ?? 0),
        bins,
      },
    };
  }
  private materializeHistory(session: string, at: number): void {
    const key = `${session}:${at}:${this.revision}`;
    if (key === this.historyKey) return;
    this.db.exec(
      "DROP TABLE IF EXISTS temp.history; CREATE TEMP TABLE history AS SELECT * FROM operations WHERE 0;",
    );
    this.db
      .prepare(
        `INSERT INTO history SELECT json_extract(r.data,'$.id'),json_extract(r.data,'$.sessionId'),json_extract(r.data,'$.kind'),json_extract(r.data,'$.status'),json_extract(r.data,'$.parentId'),json_extract(r.data,'$.start'),json_extract(r.data,'$.end'),json_extract(r.data,'$.startSequence'),json_extract(r.data,'$.runtimeId'),lower(json_extract(r.data,'$.name') || ' ' || json_extract(r.data,'$.summary') || ' ' || json_extract(r.data,'$.source')),r.data FROM revisions r JOIN (SELECT op,max(revision) rev FROM revisions WHERE session=? AND time<=? GROUP BY op) latest ON r.op=latest.op AND r.revision=latest.rev`,
      )
      .run(session, at);
    this.db.exec(
      "CREATE INDEX temp.history_order ON history(session,start,runtime,sequence,id)",
    );
    this.historyKey = key;
  }
  committedRevision(session?: string): number {
    return session ? Number((this.db.prepare("SELECT max(revision) revision FROM events WHERE session=?").get(session) as any)?.revision ?? 0) : this.revision;
  }
  step(session: string, at: number, direction: number): number | undefined {
    const row = this.db
      .prepare(
        `SELECT time FROM events WHERE session=? AND time ${direction > 0 ? ">" : "<"} ? ORDER BY time ${direction > 0 ? "ASC" : "DESC"} LIMIT 1`,
      )
      .get(session, at) as any;
    return row?.time;
  }
  close(): void {
    this.raw.close();
    this.db.close();
  }
}
function eventDto(row: any): ExecutionEvent {
  return {
    id: row.id,
    operationId: row.op ?? undefined,
    type: row.type,
    timestamp: row.time,
    sequence: row.sequence,
    runtimeId: row.runtime,
    revision: row.revision,
  };
}
