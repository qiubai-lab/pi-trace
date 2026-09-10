import { chmodSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export interface RuntimeDiagnostics {
  schemaVersion: 1;
  runtimeId: string;
  droppedEvents: number;
  storageErrors: number;
  lastError?: string;
  lastErrorAt?: string;
  updatedAt: string;
}

function empty(runtimeId: string): RuntimeDiagnostics {
  return { schemaVersion: 1, runtimeId, droppedEvents: 0, storageErrors: 0, updatedAt: new Date().toISOString() };
}

function parse(value: unknown, runtimeId: string): RuntimeDiagnostics {
  if (typeof value !== "object" || value === null) return empty(runtimeId);
  const input = value as Partial<RuntimeDiagnostics>;
  if (input.schemaVersion !== 1 || input.runtimeId !== runtimeId) return empty(runtimeId);
  return {
    schemaVersion: 1,
    runtimeId,
    droppedEvents: Number(input.droppedEvents) || 0,
    storageErrors: Number(input.storageErrors) || 0,
    lastError: input.lastError,
    lastErrorAt: input.lastErrorAt,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

export class RuntimeDiagnosticsStore {
  readonly path: string;
  readonly directory: string;
  readonly runtimeId: string;

  constructor(directory: string, runtimeId: string) {
    this.directory = directory;
    this.runtimeId = runtimeId;
    this.path = join(directory, `${runtimeId}.json`);
  }

  async load(): Promise<RuntimeDiagnostics> {
    try { return parse(JSON.parse(await readFile(this.path, "utf8")), this.runtimeId); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty(this.runtimeId); throw error; }
  }

  recordError(error: unknown): void {
    this.update(state => {
      state.storageErrors++;
      state.lastError = error instanceof Error ? error.message : String(error);
      state.lastErrorAt = new Date().toISOString();
    });
  }

  recordDrop(count: number, error?: unknown): void {
    this.update(state => {
      state.droppedEvents += count;
      if (error !== undefined) {
        state.lastError = error instanceof Error ? error.message : String(error);
        state.lastErrorAt = new Date().toISOString();
      }
    });
  }

  private update(change: (state: RuntimeDiagnostics) => void): void {
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      try { chmodSync(this.directory, 0o700); } catch { /* best effort */ }
      let state = empty(this.runtimeId);
      try { state = parse(JSON.parse(readFileSync(this.path, "utf8")), this.runtimeId); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") state = empty(this.runtimeId); }
      change(state);
      state.updatedAt = new Date().toISOString();
      const temporary = `${this.path}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      renameSync(temporary, this.path);
    } catch {
      try {
        for (const name of readdirSync(this.directory)) {
          if (name.startsWith(`${this.runtimeId}.json.tmp-${process.pid}-`)) rmSync(join(this.directory, name), { force: true });
        }
      } catch { /* diagnostics are best effort */ }
    }
  }
}

export interface DiagnosticsSummary {
  droppedEvents: number;
  storageErrors: number;
  lastError?: string;
  lastErrorAt?: string;
}

export async function summarizeDiagnostics(directory: string): Promise<DiagnosticsSummary> {
  const summary: DiagnosticsSummary = { droppedEvents: 0, storageErrors: 0 };
  let names: string[];
  try { names = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return summary; throw error; }
  for (const name of names.filter(name => name.endsWith(".json"))) {
    try {
      const runtimeId = name.slice(0, -5);
      const item = parse(JSON.parse(await readFile(join(directory, name), "utf8")), runtimeId);
      summary.droppedEvents += item.droppedEvents;
      summary.storageErrors += item.storageErrors;
      if (item.lastErrorAt && (!summary.lastErrorAt || item.lastErrorAt > summary.lastErrorAt)) {
        summary.lastErrorAt = item.lastErrorAt;
        summary.lastError = item.lastError;
      }
    } catch { /* one corrupt diagnostic file must not hide the rest */ }
  }
  return summary;
}
