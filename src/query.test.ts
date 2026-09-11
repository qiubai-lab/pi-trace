import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CorrelationState } from "./events.ts";
import { TraceQueryService } from "./query.ts";
import { TraceStore } from "./store.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe("Web trace query boundary", () => {
  it("paginates lightweight sessions and events and loads payload only by event id", async () => {
    const root = await mkdtemp(join(tmpdir(), "qb-trace-query-")); roots.push(root);
    const path = join(root, "traces.sqlite");
    const state = new CorrelationState("query");
    const events = [
      state.envelope("message_end", { message: { role: "user", content: [{ type: "text", text: "secret-a" }] } }, { sessionId: "a", cwd: "/a", provider: "p", model: "m" }),
      state.envelope("tool_result", { isError: true, text: "secret-b" }, { sessionId: "a", cwd: "/a", provider: "p", model: "m" }),
      state.envelope("turn_start", { text: "secret-c" }, { sessionId: "b", cwd: "/b" }),
    ];
    events[0]!.timestampMs = 101; events[0]!.timestamp = "1970-01-01T00:00:00.101Z";
    events[1]!.timestampMs = 101; events[1]!.timestamp = "1970-01-01T00:00:00.101Z";
    events[2]!.timestampMs = 200; events[2]!.timestamp = "1970-01-01T00:00:00.200Z";
    const store = new TraceStore(path); store.append(events); store.close();

    const query = new TraceQueryService(path);
    const firstSessions = query.sessions(1);
    expect(firstSessions.items.map(item => item.sessionId)).toEqual(["b"]);
    expect(firstSessions.nextCursor).toBeTruthy();
    expect(query.sessions(1, firstSessions.nextCursor).items.map(item => item.sessionId)).toEqual(["a"]);

    const firstEvents = query.events({ sessionId: "a" }, 1);
    expect(firstEvents.items[0]).toMatchObject({ eventType: "tool_result", isError: true });
    expect(firstEvents.items[0]).not.toHaveProperty("payloadJson");
    const secondEvents = query.events({ sessionId: "a" }, 1, firstEvents.nextCursor);
    expect(secondEvents.items.map(item => item.eventType)).toEqual(["message_end"]);
    expect(query.events({ sessionId: "a", eventType: "message_end" }, 10).items).toHaveLength(1);
    expect(query.sessionSummary("a")).toMatchObject({ sessionId: "a", eventCount: 2, errors: 1 });
    const chronological = [...events.slice(0, 2)].sort((left, right) => left.timestampMs - right.timestampMs || left.eventId.localeCompare(right.eventId));
    const firstTimeline = query.timeline({ sessionId: "a" }, 1);
    expect(firstTimeline.items[0]).toMatchObject({ eventId: chronological[0]!.eventId, runKey: expect.any(String), turnKey: expect.any(String) });
    expect(firstTimeline.nextCursor).toBeTruthy();
    const secondTimeline = query.timeline({ sessionId: "a" }, 1, firstTimeline.nextCursor);
    expect(secondTimeline.items.map(item => item.eventId)).toEqual([chronological[1]!.eventId]);
    expect(new Set([...firstTimeline.items, ...secondTimeline.items].map(item => item.eventId)).size).toBe(2);
    expect(query.conversation({ sessionId: "a" }, 10).items[0]).toMatchObject({ role: "user", preview: "secret-a" });
    expect(query.eventDetail(events[0]!.eventId)?.payloadJson).toContain("secret-a");
    expect(query.eventDetail("missing")).toBeUndefined();
    expect(query.eventTypeStats()[0]).toMatchObject({ eventType: expect.any(String), eventCount: 1 });
    query.close();
  });

  it("pages meaningful Conversation context oldest-first without streaming-update starvation", async () => {
    const root = await mkdtemp(join(tmpdir(), "qb-trace-query-")); roots.push(root);
    const path = join(root, "traces.sqlite");
    const state = new CorrelationState("conversation");
    const system = state.envelope("before_agent_start", { systemPrompt: "system context", prompt: "hello" }, { sessionId: "session" });
    const noise = Array.from({ length: 25 }, () => state.envelope("message_update", { assistantMessageEvent: { type: "text_delta", delta: "x" } }, { sessionId: "session" }));
    const user = state.envelope("message_end", { message: { role: "user", content: [{ type: "text", text: "hello" }] } }, { sessionId: "session" });
    for (const event of [system, ...noise, user]) { event.timestampMs = 101; event.timestamp = "1970-01-01T00:00:00.101Z"; }
    const store = new TraceStore(path); store.append([system, ...noise, user]); store.close();

    const query = new TraceQueryService(path);
    const first = query.conversation({ sessionId: "session" }, 1);
    const second = query.conversation({ sessionId: "session" }, 1, first.nextCursor);
    expect(first.items.map(item => item.title)).toEqual(["System prompt"]);
    expect(second.items.map(item => item.title)).toEqual(["User prompt"]);
    expect(first.nextCursor).toBeTruthy();
    expect(second.nextCursor).toBeUndefined();
    expect(new Set([...first.items, ...second.items].map(item => item.itemId)).size).toBe(2);
    query.close();
  });

  it("counts repeated turn indexes independently across Agent runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "qb-trace-query-")); roots.push(root);
    const path = join(root, "traces.sqlite");
    const state = new CorrelationState("runs");
    state.beginAgent(); state.beginTurn(0);
    const first = state.envelope("turn_start", {}, { sessionId: "session" });
    state.endAgent(); state.beginAgent(); state.beginTurn(0);
    const second = state.envelope("turn_start", {}, { sessionId: "session" });
    const store = new TraceStore(path); store.append([first, second]); store.close();
    const query = new TraceQueryService(path);
    expect(query.sessionSummary("session")).toMatchObject({ agentRuns: 2, turns: 2 });
    query.close();
  });

  it("rejects malformed and cross-kind cursors", async () => {
    const root = await mkdtemp(join(tmpdir(), "qb-trace-query-")); roots.push(root);
    const path = join(root, "traces.sqlite"); new TraceStore(path).close();
    const query = new TraceQueryService(path);
    expect(() => query.events({}, 10, "invalid")).toThrow(/invalid cursor/);
    const sessions = query.sessions(1);
    if (sessions.nextCursor) expect(() => query.events({}, 10, sessions.nextCursor)).toThrow(/invalid cursor/);
    query.close();
  });
});
