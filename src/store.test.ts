import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CorrelationState } from "./events.ts";
import { TraceStore } from "./store.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function path(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "qb-trace-db-")); roots.push(root); return join(root, "traces.sqlite"); }

describe("trace store", () => {
  it("uses WAL and idempotently appends events from distinct runtimes", async () => {
    const dbPath = await path();
    const storeA = new TraceStore(dbPath);
    const storeB = new TraceStore(dbPath);
    const a = new CorrelationState("a").envelope("agent_start", {}, { sessionId: "s" });
    const b = new CorrelationState("b").envelope("agent_start", {}, { sessionId: "s" });
    storeA.append([a, a]);
    storeB.append([b]);
    expect(storeA.journalMode()).toBe("wal");
    expect(storeA.countEvents()).toBe(2);
    expect(storeA.listEvents("s").map(event => event.runtimeId).sort()).toEqual(["a", "b"]);
    storeA.close(); storeB.close();
  });

  it("refuses a newer schema without rewriting it", async () => {
    const dbPath = await path();
    const raw = new DatabaseSync(dbPath);
    raw.exec("PRAGMA user_version = 99");
    raw.close();
    const before = await readFile(dbPath);
    expect(() => new TraceStore(dbPath)).toThrow(/newer schema.*99/i);
    expect(await readFile(dbPath)).toEqual(before);
    const check = new DatabaseSync(dbPath, { readOnly: true });
    expect((check.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(99);
    check.close();
  });

  it("supports concurrent writer processes and a read-only observer", async () => {
    const dbPath = await path();
    new TraceStore(dbPath).close();
    const storeUrl = pathToFileURL(resolve("src/store.ts")).href;
    const eventsUrl = pathToFileURL(resolve("src/events.ts")).href;
    const run = (runtimeId: string) => new Promise<void>((resolveChild, reject) => {
      const source = `
        import { TraceStore } from ${JSON.stringify(storeUrl)};
        import { CorrelationState } from ${JSON.stringify(eventsUrl)};
        const store = new TraceStore(${JSON.stringify(dbPath)}, { timeoutMs: 2000 });
        const state = new CorrelationState(${JSON.stringify(runtimeId)});
        store.append(Array.from({ length: 25 }, () => state.envelope("turn_start", {}, { sessionId: "shared" })));
        store.close();
      `;
      const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "-e", source]);
      let stderr = "";
      child.stderr.on("data", chunk => { stderr += chunk; });
      child.once("error", reject);
      child.once("exit", code => code === 0 ? resolveChild() : reject(new Error(stderr || `child exited ${code}`)));
    });
    const observer = new TraceStore(dbPath, { readOnly: true });
    await Promise.all([run("p1"), run("p2"), run("p3")]);
    observer.close();
    const check = new TraceStore(dbPath, { readOnly: true });
    expect(check.countEvents()).toBe(75);
    check.close();
  });

  it("transactionally previews and prunes selected events without changing controls or schema", async () => {
    const store = new TraceStore(await path());
    const state = new CorrelationState("prune");
    const oldEvent = state.envelope("old", { value: "old" }, { sessionId: "s" });
    const boundaryEvent = state.envelope("boundary", { value: "boundary" }, { sessionId: "s" });
    const newEvent = state.envelope("new", { value: "new" }, { sessionId: "s" });
    oldEvent.timestampMs = 99;
    boundaryEvent.timestampMs = 100;
    newEvent.timestampMs = 101;
    store.append([oldEvent, boundaryEvent, newEvent]);
    store.appendControl(false, "cli");

    expect(store.eventStats(100)).toEqual({ eventCount: 1, payloadBytes: oldEvent.payloadBytes });
    expect(store.pruneEvents(100)).toEqual({
      deletedEvents: 1,
      deletedPayloadBytes: oldEvent.payloadBytes,
      remainingEvents: 2,
    });
    expect(store.listEvents("s").map(event => event.eventType)).toEqual(["boundary", "new"]);
    expect(store.listControls()).toHaveLength(1);
    expect(store.schemaVersion()).toBe(1);

    expect(store.pruneEvents()).toMatchObject({ deletedEvents: 2, remainingEvents: 0 });
    expect(() => store.checkpointAndVacuum()).not.toThrow();
    expect(store.schemaVersion()).toBe(1);
    store.close();
  });

  it("writes recording control boundaries independently of a runtime", async () => {
    const store = new TraceStore(await path());
    store.appendControl(true, "cli");
    store.appendControl(false, "cli");
    expect(store.listControls().map(item => item.enabled)).toEqual([1, 0]);
    store.close();
  });
});
