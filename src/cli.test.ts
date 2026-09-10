import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./cli.ts";

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
