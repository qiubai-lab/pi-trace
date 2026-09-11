import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { RecordingConfigStore } from "../config.ts";
import type { TraceEventFilters } from "../contracts.ts";
import { summarizeDiagnostics } from "../diagnostics.ts";
import type { TracePaths } from "../paths.ts";
import { TraceQueryService } from "../query.ts";
import { DATABASE_SCHEMA_VERSION, traceDatabaseSize } from "../store.ts";
import { securityHeaders, send } from "./http.ts";

export interface ActiveStream { timer: NodeJS.Timeout; response: ServerResponse; }
export interface ApiRouteContext { paths: TracePaths; streams: Set<ActiveStream>; streamIntervalMs: number; }

function limit(value: string | null): number {
  if (value === null) return 50;
  if (!/^\d+$/.test(value)) throw new Error("limit must be an integer");
  const parsed = Number(value);
  if (parsed < 1 || parsed > 200) throw new Error("limit must be between 1 and 200");
  return parsed;
}
function optionalNumber(value: string | null, name: string): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number`);
  return parsed;
}
function filters(params: URLSearchParams, sessionId?: string): TraceEventFilters {
  return {
    sessionId, eventType: params.get("eventType") ?? undefined, runtimeId: params.get("runtimeId") ?? undefined,
    agentRunId: params.get("agentRunId") ?? undefined, turnIndex: optionalNumber(params.get("turnIndex"), "turnIndex"),
    toolCallId: params.get("toolCallId") ?? undefined, provider: params.get("provider") ?? undefined,
    model: params.get("model") ?? undefined, fromTimestampMs: optionalNumber(params.get("from"), "from"),
    toTimestampMs: optionalNumber(params.get("to"), "to"),
  };
}

export async function handleApiRoute(req: IncomingMessage, res: ServerResponse, url: URL, context: ApiRouteContext): Promise<void> {
  const { paths } = context;
  if (url.pathname === "/api/v1/health") {
    if (!existsSync(paths.database)) { send(res, 200, { ok: true, database: "not-created", expectedSchema: DATABASE_SCHEMA_VERSION }); return; }
    const query = new TraceQueryService(paths.database);
    try { send(res, 200, { ok: true, database: "ready", schemaVersion: query.schemaVersion() }); } finally { query.close(); }
    return;
  }
  if (url.pathname === "/api/v1/status") {
    const recording = (await new RecordingConfigStore(paths.config, true).load()).enabled;
    const diagnostics = await summarizeDiagnostics(paths.diagnostics);
    let overview = { eventCount: 0, payloadBytes: 0 } as ReturnType<TraceQueryService["overview"]>;
    let schemaVersion = DATABASE_SCHEMA_VERSION;
    if (existsSync(paths.database)) {
      const query = new TraceQueryService(paths.database);
      try { overview = query.overview(); schemaVersion = query.schemaVersion(); } finally { query.close(); }
    }
    send(res, 200, { recording, schemaVersion, databaseSizeBytes: traceDatabaseSize(paths.database), overview, diagnostics }); return;
  }
  if (url.pathname === "/api/v1/stats/event-types") {
    if (!existsSync(paths.database)) { send(res, 200, { items: [] }); return; }
    const query = new TraceQueryService(paths.database);
    try { send(res, 200, { items: query.eventTypeStats() }); } finally { query.close(); }
    return;
  }
  if (url.pathname === "/api/v1/sessions") {
    if (!existsSync(paths.database)) { send(res, 200, { items: [] }); return; }
    const query = new TraceQueryService(paths.database);
    try { send(res, 200, query.sessions(limit(url.searchParams.get("limit")), url.searchParams.get("cursor") ?? undefined)); } finally { query.close(); }
    return;
  }
  const sessionViewMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/(summary|timeline|conversation)$/);
  if (sessionViewMatch) {
    if (!existsSync(paths.database)) { send(res, 404, { error: "session not found" }); return; }
    const sessionId = decodeURIComponent(sessionViewMatch[1]!);
    const view = sessionViewMatch[2]!;
    const query = new TraceQueryService(paths.database);
    try {
      if (view === "summary") {
        const item = query.sessionSummary(sessionId);
        item ? send(res, 200, item) : send(res, 404, { error: "session not found" });
      } else if (view === "timeline") {
        send(res, 200, query.timeline(filters(url.searchParams, sessionId), limit(url.searchParams.get("limit")), url.searchParams.get("cursor") ?? undefined));
      } else {
        send(res, 200, query.conversation(filters(url.searchParams, sessionId), limit(url.searchParams.get("limit")), url.searchParams.get("cursor") ?? undefined));
      }
    } finally { query.close(); }
    return;
  }
  const sessionMatch = url.pathname.match(/^\/api\/v1\/sessions\/([^/]+)\/events$/);
  if (sessionMatch) {
    const query = new TraceQueryService(paths.database);
    try { send(res, 200, query.events(filters(url.searchParams, decodeURIComponent(sessionMatch[1]!)), limit(url.searchParams.get("limit")), url.searchParams.get("cursor") ?? undefined)); } finally { query.close(); }
    return;
  }
  const detailMatch = url.pathname.match(/^\/api\/v1\/events\/(?!stream$)([^/]+)$/);
  if (detailMatch) {
    const query = new TraceQueryService(paths.database);
    try { const item = query.eventDetail(decodeURIComponent(detailMatch[1]!)); item ? send(res, 200, item) : send(res, 404, { error: "event not found" }); } finally { query.close(); }
    return;
  }
  if (url.pathname === "/api/v1/events/stream") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) { send(res, 400, { error: "sessionId is required" }); return; }
    res.writeHead(200, { ...securityHeaders("text/event-stream; charset=utf-8"), Connection: "keep-alive" });
    res.write(": connected\n\n");
    let cursor = url.searchParams.get("cursor") ?? undefined;
    const fromTimestampMs = cursor ? undefined : Date.now();
    let ticks = 0; let polling = false;
    const poll = async () => {
      if (polling || res.destroyed) return;
      polling = true;
      try {
        if (existsSync(paths.database)) {
          const query = new TraceQueryService(paths.database);
          try {
            const page = query.eventsAfter({ sessionId, fromTimestampMs }, 100, cursor);
            cursor = page.nextCursor;
            if (page.items.length) res.write(`id: ${cursor}\nevent: events\ndata: ${JSON.stringify(page)}\n\n`);
          } finally { query.close(); }
        }
        if (++ticks % 15 === 0) res.write(": heartbeat\n\n");
      } catch (error) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`);
      } finally { polling = false; }
    };
    const timer = setInterval(() => { void poll(); }, context.streamIntervalMs); timer.unref();
    const stream = { timer, response: res }; context.streams.add(stream);
    req.once("close", () => { clearInterval(timer); context.streams.delete(stream); });
    return;
  }
  send(res, 404, { error: "not found" });
}
