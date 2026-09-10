import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface RecordingConfig {
  schemaVersion: 1;
  enabled: boolean;
}

const DEFAULT_CONFIG: RecordingConfig = { schemaVersion: 1, enabled: false };

export function parseRecordingConfig(value: unknown): RecordingConfig {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("recording config must be an object");
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1) throw new Error(`unsupported recording config schema: ${String(input.schemaVersion)}`);
  if (typeof input.enabled !== "boolean") throw new Error("recording config enabled must be a boolean");
  return { schemaVersion: 1, enabled: input.enabled };
}

export class RecordingConfigStore {
  readonly path: string;

  constructor(homeOrPath: string, isPath = false) {
    this.path = isPath ? homeOrPath : join(homeOrPath, "config.json");
  }

  async load(): Promise<RecordingConfig> {
    try {
      return parseRecordingConfig(JSON.parse(await readFile(this.path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_CONFIG };
      if (error instanceof SyntaxError) throw new Error(`recording config is invalid at ${this.path}: ${error.message}`);
      throw error;
    }
  }

  async setEnabled(enabled: boolean): Promise<RecordingConfig> {
    const config: RecordingConfig = { schemaVersion: 1, enabled };
    await this.save(config);
    return config;
  }

  async revision(): Promise<string> {
    const metadata = await stat(this.path, { bigint: true });
    return `${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeNs}`;
  }

  async save(config: RecordingConfig): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.path), 0o700);
    const temporary = `${this.path}.tmp-${process.pid}-${Date.now()}`;
    try {
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(config, null, 2)}\n`);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, this.path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  /** Test-only fixture seam; production callers use save/setEnabled. */
  async writeRawForTest(value: unknown): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    await chmod(dirname(this.path), 0o700);
    await writeFile(this.path, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  }
}

export class RecordingGate {
  private timer?: NodeJS.Timeout;
  private enabled?: boolean;
  private checking = false;
  private readonly store: RecordingConfigStore;
  private readonly onChange: (enabled: boolean) => void | Promise<void>;
  private readonly intervalMs: number;

  constructor(store: RecordingConfigStore, onChange: (enabled: boolean) => void | Promise<void>, intervalMs = 500) {
    this.store = store;
    this.onChange = onChange;
    this.intervalMs = intervalMs;
  }

  async start(): Promise<void> {
    await this.check();
    this.timer = setInterval(() => { void this.check(); }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async check(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const next = (await this.store.load()).enabled;
      if (next !== this.enabled) {
        this.enabled = next;
        await this.onChange(next);
      }
    } catch {
      // A malformed or temporarily unavailable config must not affect Pi.
    } finally {
      this.checking = false;
    }
  }
}
