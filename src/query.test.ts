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
      state.envelope("message_end", { text: "secret-a" }, { sessionId: "a", cwd: "/a", provider: "p", model: "m" }),
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
    expect(query.eventDetail(events[0]!.eventId)?.payloadJson).toContain("secret-a");
    expect(query.eventDetail("missing")).toBeUndefined();
    expect(query.eventTypeStats()[0]).toMatchObject({ eventType: expect.any(String), eventCount: 1 });
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
