import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { RecordingConfigStore } from "./config.ts";
import { summarizeDiagnostics } from "./diagnostics.ts";
import type { TracePaths } from "./paths.ts";
import { TraceQueryService } from "./query.ts";
import { DATABASE_SCHEMA_VERSION, traceDatabaseSize, type TraceEventFilters } from "./store.ts";
import { WEB_CSS, WEB_HTML, WEB_JS } from "./web.ts";

export interface TraceServerOptions { host?: string; port?: number; token?: string; streamIntervalMs?: number; }
export interface RunningTraceServer { host: string; port: number; token: string; url: string; close(): Promise<void>; }

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const API_PREFIX = "/api/v1/";

function securityHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  };
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, securityHeaders(typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8"));
  res.end(text);
}

function secureEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
    sessionId,
    eventType: params.get("eventType") ?? undefined,
    runtimeId: params.get("runtimeId") ?? undefined,
    agentRunId: params.get("agentRunId") ?? undefined,
    turnIndex: optionalNumber(params.get("turnIndex"), "turnIndex"),
    toolCallId: params.get("toolCallId") ?? undefined,
    provider: params.get("provider") ?? undefined,
    model: params.get("model") ?? undefined,
    fromTimestampMs: optionalNumber(params.get("from"), "from"),
    toTimestampMs: optionalNumber(params.get("to"), "to"),
  };
}

function hostAllowed(req: IncomingMessage, host: string, port: number): boolean {
  const expected = host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
  return req.headers.host === expected || (host === "127.0.0.1" && req.headers.host === `localhost:${port}`);
}

export async function startTraceServer(paths: TracePaths, options: TraceServerOptions = {}): Promise<RunningTraceServer> {
  const host = options.host ?? "127.0.0.1";
  if (!LOOPBACK.has(host)) throw new Error("server host must be loopback (127.0.0.1, localhost, or ::1)");
  const requestedPort = options.port ?? 7432;
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) throw new Error("server port must be between 0 and 65535");
  const token = options.token ?? randomBytes(24).toString("base64url");
  const streams = new Set<{ timer: NodeJS.Timeout; response: ServerResponse }>();
  let boundPort = requestedPort;

  const server = createServer(async (req, res) => {
    try {
      if (!hostAllowed(req, host, boundPort)) { send(res, 421, { error: "invalid host" }); return; }
      if (req.method !== "GET") { res.setHeader("Allow", "GET"); send(res, 405, { error: "method not allowed" }); return; }
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (url.pathname === "/") { res.writeHead(200, securityHeaders("text/html; charset=utf-8")); res.end(WEB_HTML); return; }
      if (url.pathname === "/app.js") { res.writeHead(200, securityHeaders("text/javascript; charset=utf-8")); res.end(WEB_JS); return; }
      if (url.pathname === "/styles.css") { res.writeHead(200, securityHeaders("text/css; charset=utf-8")); res.end(WEB_CSS); return; }
      if (!url.pathname.startsWith(API_PREFIX)) { send(res, 404, { error: "not found" }); return; }
      if (!secureEqual(req.headers.authorization ?? "", `Bearer ${token}`)) { send(res, 401, { error: "unauthorized" }); return; }

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
        const timer = setInterval(() => { void poll(); }, options.streamIntervalMs ?? 1_000); timer.unref();
        const stream = { timer, response: res }; streams.add(stream);
        req.once("close", () => { clearInterval(timer); streams.delete(stream); });
        return;
      }
      send(res, 404, { error: "not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /invalid cursor|must be|limit/.test(message) ? 400 : /busy|locked/i.test(message) ? 503 : 500;
      if (!res.headersSent) send(res, status, { error: message }); else res.end();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, host, () => { server.off("error", reject); resolve(); });
  });
  boundPort = (server.address() as AddressInfo).port;
  const displayHost = host.includes(":") ? `[${host}]` : host;
  return {
    host, port: boundPort, token, url: `http://${displayHost}:${boundPort}/#token=${token}`,
    close: async () => {
      for (const stream of streams) { clearInterval(stream.timer); stream.response.end(); }
      streams.clear();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
