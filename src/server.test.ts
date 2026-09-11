import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { request } from "node:http";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RecordingConfigStore } from "./config.ts";
import { CorrelationState } from "./events.ts";
import { resolveTracePaths } from "./paths.ts";
import { startTraceServer } from "./server.ts";
import { TraceStore } from "./store.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "qb-trace-server-")); roots.push(home);
  const paths = resolveTracePaths({ QB_TRACE_HOME: home });
  await new RecordingConfigStore(paths.config, true).setEnabled(true);
  const event = new CorrelationState("server").envelope("tool_result", { isError: true, text: "sensitive" }, { sessionId: "session-1", cwd: "/project" });
  const store = new TraceStore(paths.database); store.append([event]); store.close();
  return { paths, event };
}

describe("local Trace Web server", () => {
  it("serves authenticated bounded read-only APIs and secure local assets", async () => {
    const { paths, event } = await fixture();
    const server = await startTraceServer(paths, { port: 0, token: "test-token" });
    try {
      const root = await fetch(`http://127.0.0.1:${server.port}/`);
      expect(root.status).toBe(200);
      expect(root.headers.get("content-security-policy")).toContain("default-src 'self'");
      expect(root.headers.get("access-control-allow-origin")).toBeNull();
      const html = await root.text();
      expect(html).toContain("QB Trace");
      const scriptPath = html.match(/src="([^"]+\.js)"/)?.[1];
      const stylePath = html.match(/href="([^"]+\.css)"/)?.[1];
      expect(scriptPath).toMatch(/^\/assets\//);
      expect(stylePath).toMatch(/^\/assets\//);
      const app = await (await fetch(`http://127.0.0.1:${server.port}${scriptPath}`)).text();
      expect(app).toContain("qb-trace-token");
      expect(app).toContain("/api/v1/events/stream");
      expect(app).toContain("Payloads are unredacted");
      expect(html).not.toMatch(/(?:src|href)="https?:\/\//);

      expect((await fetch(`http://127.0.0.1:${server.port}/api/v1/status`)).status).toBe(401);
      const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
        const req = request({ host: "127.0.0.1", port: server.port, path: "/api/v1/status", headers: { Host: "evil.local" } }, res => {
          res.resume(); res.once("end", () => resolve(res.statusCode));
        });
        req.once("error", reject); req.end();
      });
      expect(invalidHostStatus).toBe(421);
      const headers = { Authorization: "Bearer test-token" };
      const statusResponse = await fetch(`http://127.0.0.1:${server.port}/api/v1/status`, { headers });
      expect(statusResponse.status).toBe(200);
      expect(await statusResponse.json()).toMatchObject({ recording: true, schemaVersion: 1, overview: { eventCount: 1 } });
      const stats = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/stats/event-types`, { headers })).json() as any;
      expect(stats.items[0]).toMatchObject({ eventType: "tool_result", eventCount: 1 });
      const sessions = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/sessions?limit=1`, { headers })).json() as any;
      expect(sessions.items[0]).toMatchObject({ sessionId: "session-1", eventCount: 1 });
      const summary = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/sessions/session-1/summary`, { headers })).json() as any;
      expect(summary).toMatchObject({ sessionId: "session-1", eventCount: 1, errors: 1 });
      const timeline = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/sessions/session-1/timeline?limit=1`, { headers })).json() as any;
      expect(timeline.items[0]).toMatchObject({ eventType: "tool_result", runKey: expect.any(String), turnKey: expect.any(String) });
      expect(timeline.items[0]).not.toHaveProperty("payloadJson");
      const conversation = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/sessions/session-1/conversation?limit=1`, { headers })).json() as any;
      expect(conversation.items[0]).toMatchObject({ eventId: event.eventId, itemId: `${event.eventId}:result`, role: "tool", title: "Tool", toolStatus: "error", isError: true });
      expect(conversation.items[0]).not.toHaveProperty("payloadJson");
      const events = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/sessions/session-1/events?limit=1`, { headers })).json() as any;
      expect(events.items[0]).not.toHaveProperty("payloadJson");
      const detail = await (await fetch(`http://127.0.0.1:${server.port}/api/v1/events/${encodeURIComponent(event.eventId)}`, { headers })).json() as any;
      expect(detail.payloadJson).toContain("sensitive");
      expect((await fetch(`http://127.0.0.1:${server.port}/api/v1/events/missing`, { headers })).status).toBe(404);
      expect((await fetch(`http://127.0.0.1:${server.port}/api/v1/sessions?limit=201`, { headers })).status).toBe(400);
      expect((await fetch(`http://127.0.0.1:${server.port}/api/v1/sessions/session-1/events?cursor=bad`, { headers })).status).toBe(400);
      expect((await fetch(`http://127.0.0.1:${server.port}/api/v1/status`, { method: "POST", headers })).status).toBe(405);
    } finally { await server.close(); }
  });

  it("rejects non-loopback hosts", async () => {
    const { paths } = await fixture();
    await expect(startTraceServer(paths, { host: "0.0.0.0", port: 0 })).rejects.toThrow(/loopback/);
  });

  it("streams newly appended event summaries and closes on abort", async () => {
    const { paths } = await fixture();
    const server = await startTraceServer(paths, { port: 0, token: "stream-token", streamIntervalMs: 20 });
    const abort = new AbortController();
    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/api/v1/events/stream?sessionId=live`, {
        headers: { Authorization: "Bearer stream-token" }, signal: abort.signal,
      });
      expect(response.status).toBe(200);
      const store = new TraceStore(paths.database);
      store.append([new CorrelationState("live").envelope("turn_start", { live: true }, { sessionId: "live" })]);
      store.close();
      const reader = response.body!.getReader(); const decoder = new TextDecoder(); let text = "";
      const deadline = Date.now() + 2_000;
      while (!text.includes("event: events") && Date.now() < deadline) text += decoder.decode((await reader.read()).value);
      expect(text).toContain("turn_start");
      abort.abort();
    } finally { abort.abort(); await server.close(); }
  });
});
