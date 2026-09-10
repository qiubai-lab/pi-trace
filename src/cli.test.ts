import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./cli.ts";
import { CorrelationState } from "./events.ts";
import { RecordingConfigStore } from "./config.ts";
import { RuntimeDiagnosticsStore } from "./diagnostics.ts";
import { TraceStore } from "./store.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function fixture() { const home = await mkdtemp(join(tmpdir(), "qb-trace-cli-")); roots.push(home); const out: string[] = []; const err: string[] = []; return { home, out, err, io: { stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) } }; }

describe("qb-trace CLI", () => {
  it("controls recording without Pi or a server", async () => {
    const fx = await fixture();
    expect(await runCli(["on"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(await runCli(["status"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(fx.out.join("\n")).toContain("recording: on");
    expect((await stat(join(fx.home, "config.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(fx.home, "traces.sqlite"))).mode & 0o777).toBe(0o600);
    expect(await runCli(["off"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(await runCli(["status"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(fx.out.join("\n")).toContain("recording: off");
  });

  it("requires an explicit valid prune selector without mutating data", async () => {
    const fx = await fixture();
    const store = new TraceStore(join(fx.home, "traces.sqlite"));
    store.append([new CorrelationState("invalid-prune").envelope("event", {}, { sessionId: "s" })]);
    store.close();

    for (const args of [
      ["prune"],
      ["prune", "--older-than", "0d"],
      ["prune", "--older-than", "7w"],
      ["prune", "--older-than", "1d", "--all"],
      ["prune", "--all", "--all"],
      ["prune", "--all", "--unknown"],
    ]) {
      expect(await runCli(args, fx.io, { QB_TRACE_HOME: fx.home }, { pruneGraceMs: 0 })).not.toBe(0);
    }

    const check = new TraceStore(join(fx.home, "traces.sqlite"), { readOnly: true });
    expect(check.countEvents()).toBe(1);
    check.close();
  });

  it("previews prune while recording is on, then prunes by age while preserving controls and configuration", async () => {
    const fx = await fixture();
    expect(await runCli(["on"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    const store = new TraceStore(join(fx.home, "traces.sqlite"));
    const state = new CorrelationState("age-prune");
    const oldEvent = state.envelope("old", { text: "old payload" }, { sessionId: "s" });
    const newEvent = state.envelope("new", { text: "new payload" }, { sessionId: "s" });
    oldEvent.timestampMs = Date.now() - 2 * 60 * 60 * 1_000;
    newEvent.timestampMs = Date.now();
    store.append([oldEvent, newEvent]);
    store.close();
    const diagnostics = new RuntimeDiagnosticsStore(join(fx.home, "diagnostics"), "preserved");
    diagnostics.recordError(new Error("existing diagnostic"));

    const compactDatabase = vi.fn();
    expect(await runCli(
      ["prune", "--older-than", "1h", "--dry-run", "--vacuum"],
      fx.io,
      { QB_TRACE_HOME: fx.home },
      { compactDatabase },
    )).toBe(0);
    expect(fx.out.join("\n")).toContain("matched events: 1");
    expect(await runCli(["prune", "--all", "--dry-run"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(await runCli(
      ["prune", "--older-than", "1h", "--vacuum"],
      fx.io,
      { QB_TRACE_HOME: fx.home },
      { pruneGraceMs: 0, compactDatabase },
    )).not.toBe(0);
    expect(compactDatabase).not.toHaveBeenCalled();

    expect(await runCli(["off"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(await runCli(["prune", "--older-than", "1h"], fx.io, { QB_TRACE_HOME: fx.home }, { pruneGraceMs: 0 })).toBe(0);
    const check = new TraceStore(join(fx.home, "traces.sqlite"), { readOnly: true });
    expect(check.listEvents("s").map(event => event.eventType)).toEqual(["new"]);
    expect(check.listControls()).toHaveLength(2);
    check.close();
    expect((await new RecordingConfigStore(fx.home).load()).enabled).toBe(false);
    expect((await diagnostics.load()).storageErrors).toBe(1);
    expect(fx.out.join("\n")).toContain("deleted events: 1");
    expect(fx.out.join("\n")).toContain("deleted payload bytes: 22");
    expect(fx.out.join("\n")).toContain("remaining events: 1");
  });

  it("rechecks recording state after the prune grace period", async () => {
    const fx = await fixture();
    const config = new RecordingConfigStore(fx.home);
    await config.setEnabled(false);
    const store = new TraceStore(join(fx.home, "traces.sqlite"));
    store.append([new CorrelationState("grace-prune").envelope("event", {}, { sessionId: "s" })]);
    store.close();

    const code = await runCli(
      ["prune", "--all"],
      fx.io,
      { QB_TRACE_HOME: fx.home },
      { pruneGraceMs: 1, sleep: async () => { await config.setEnabled(true); } },
    );
    expect(code).not.toBe(0);
    const check = new TraceStore(join(fx.home, "traces.sqlite"), { readOnly: true });
    expect(check.countEvents()).toBe(1);
    check.close();
  });

  it("reports deletion as committed when optional vacuum fails", async () => {
    const fx = await fixture();
    await new RecordingConfigStore(fx.home).setEnabled(false);
    const store = new TraceStore(join(fx.home, "traces.sqlite"));
    store.append([new CorrelationState("vacuum-prune").envelope("event", {}, { sessionId: "s" })]);
    store.close();

    const code = await runCli(
      ["prune", "--all", "--vacuum"],
      fx.io,
      { QB_TRACE_HOME: fx.home },
      { pruneGraceMs: 0, compactDatabase: () => { throw new Error("vacuum blocked"); } },
    );
    expect(code).not.toBe(0);
    expect(fx.err.join("\n")).toMatch(/events were deleted.*vacuum blocked/i);
    const check = new TraceStore(join(fx.home, "traces.sqlite"), { readOnly: true });
    expect(check.countEvents()).toBe(0);
    check.close();
  });

  it("reserves server without pretending it started", async () => {
    const fx = await fixture();
    expect(await runCli(["server"], fx.io, { QB_TRACE_HOME: fx.home })).not.toBe(0);
    expect(fx.err.join("\n")).toMatch(/not implemented/i);
  });

  it("reports diagnostics when the trace database is unavailable", async () => {
    const fx = await fixture();
    expect(await runCli(["status"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(fx.out.join("\n")).toContain("database: not created");
    await writeFile(join(fx.home, "traces.sqlite"), "not a sqlite database");
    expect(await runCli(["status"], fx.io, { QB_TRACE_HOME: fx.home })).toBe(0);
    expect(fx.out.join("\n")).toMatch(/database: unavailable/i);
  });
});
