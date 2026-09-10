import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

async function fixture(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "qb-trace-install-")); roots.push(root); return root; }

describe("qb-trace user CLI installation", () => {
  it("installs an idempotent package-owned link and the command runs standalone", async () => {
    const home = await fixture();
    const script = resolve("scripts/install-qb-trace-cli.sh");
    await exec(script, [], { env: { ...process.env, HOME: home, PATH: `${join(home, ".local", "bin")}:${process.env.PATH}` } });
    await exec(script, [], { env: { ...process.env, HOME: home, PATH: `${join(home, ".local", "bin")}:${process.env.PATH}` } });
    expect(await readlink(join(home, ".local", "bin", "qb-trace"))).toBe(resolve("bin/qb-trace"));
    const result = await exec(join(home, ".local", "bin", "qb-trace"), ["status"], { env: { ...process.env, QB_TRACE_HOME: join(home, "trace") } });
    expect(result.stdout).toContain("recording: off");
  });

  it("repoints the exact legacy pi-plugins link", async () => {
    const home = await fixture();
    const target = join(home, ".local", "bin", "qb-trace");
    await mkdir(join(home, ".local", "bin"), { recursive: true });
    await symlink("/tmp/pi-plugins/bin/qb-trace", target);
    await exec(resolve("scripts/install-qb-trace-cli.sh"), [], { env: { ...process.env, HOME: home } });
    expect(await readlink(target)).toBe(resolve("bin/qb-trace"));
  });

  it.each(["file", "symlink"])("refuses to replace a foreign %s target", async kind => {
    const home = await fixture();
    const target = join(home, ".local", "bin", "qb-trace");
    await mkdir(join(home, ".local", "bin"), { recursive: true });
    if (kind === "file") await writeFile(target, "foreign");
    else await symlink("/tmp/foreign/bin/qb-trace", target);
    await expect(exec(resolve("scripts/install-qb-trace-cli.sh"), [], { env: { ...process.env, HOME: home } })).rejects.toMatchObject({ code: 1 });
  });
});
