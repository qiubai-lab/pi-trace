import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordingConfigStore, RecordingGate } from "./config.ts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
async function home(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "qb-trace-config-")); roots.push(root); return root; }

describe("recording configuration", () => {
  it("defaults off and atomically persists the global switch", async () => {
    const store = new RecordingConfigStore(await home());
    expect(await store.load()).toEqual({ schemaVersion: 1, enabled: false });
    await store.setEnabled(true);
    expect(await store.load()).toEqual({ schemaVersion: 1, enabled: true });
    expect(JSON.parse(await readFile(store.path, "utf8"))).toEqual({ schemaVersion: 1, enabled: true });
  });

  it("rejects an unsupported configuration schema", async () => {
    const store = new RecordingConfigStore(await home());
    await store.writeRawForTest({ schemaVersion: 2, enabled: true });
    await expect(store.load()).rejects.toThrow(/unsupported.*2/i);
  });

  it("observes changes without requiring a Pi reload", async () => {
    const store = new RecordingConfigStore(await home());
    const changes: boolean[] = [];
    const gate = new RecordingGate(store, enabled => { changes.push(enabled); }, 20);
    await gate.start();
    await store.setEnabled(true);
    await vi.waitFor(() => expect(changes).toEqual([false, true]), { timeout: 500 });
    gate.stop();
  });
});
