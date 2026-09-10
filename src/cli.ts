import { existsSync } from "node:fs";
import { RecordingConfigStore } from "./config.ts";
import { RuntimeDiagnosticsStore, summarizeDiagnostics } from "./diagnostics.ts";
import { resolveTracePaths } from "./paths.ts";
import { TraceQueryService } from "./query.ts";
import { DATABASE_SCHEMA_VERSION, TraceStore, traceDatabaseSize } from "./store.ts";

export interface CliIO { stdout(text: string): void; stderr(text: string): void; }
const defaultIO: CliIO = { stdout: text => process.stdout.write(`${text}\n`), stderr: text => process.stderr.write(`${text}\n`) };

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

async function setRecording(enabled: boolean, io: CliIO, env: NodeJS.ProcessEnv): Promise<number> {
  const paths = resolveTracePaths(env);
  const config = new RecordingConfigStore(paths.config, true);
  await config.setEnabled(enabled);
  try {
    const store = new TraceStore(paths.database, { timeoutMs: 2_000 });
    try { store.appendControl(enabled, "qb-trace-cli"); } finally { store.close(); }
  } catch (error) {
    const diagnostics = new RuntimeDiagnosticsStore(paths.diagnostics, `cli-${process.pid}`);
    diagnostics.recordError(error);
    io.stderr(`recording is ${enabled ? "on" : "off"}, but the audit boundary could not be stored: ${errorText(error)}`);
    return 1;
  }
  io.stdout(`recording: ${enabled ? "on" : "off"}`);
  return 0;
}

async function status(io: CliIO, env: NodeJS.ProcessEnv): Promise<number> {
  const paths = resolveTracePaths(env);
  let enabled: boolean;
  try { enabled = (await new RecordingConfigStore(paths.config, true).load()).enabled; }
  catch (error) { io.stderr(`configuration error: ${errorText(error)}`); return 1; }

  const output = [`recording: ${enabled ? "on" : "off"}`, `config: ${paths.config}`, `database path: ${paths.database}`];
  if (!existsSync(paths.database)) {
    output.push("database: not created", `schema: ${DATABASE_SCHEMA_VERSION} (expected)`);
  } else {
    output.push(`database size: ${traceDatabaseSize(paths.database)} bytes`);
    try {
      const query = new TraceQueryService(paths.database);
      try { output.push(`schema: ${query.schemaVersion()}`, `events: ${query.countEvents()}`); }
      finally { query.close(); }
    } catch (error) {
      output.push(`database: unavailable (${errorText(error)})`);
    }
  }
  const diagnostics = await summarizeDiagnostics(paths.diagnostics);
  output.push(`storage errors: ${diagnostics.storageErrors}`, `dropped events: ${diagnostics.droppedEvents}`);
  if (diagnostics.lastError) output.push(`last error: ${diagnostics.lastErrorAt ?? "unknown time"} ${diagnostics.lastError}`);
  for (const line of output) io.stdout(line);
  return 0;
}

export async function runCli(args: string[], io: CliIO = defaultIO, env: NodeJS.ProcessEnv = process.env): Promise<number> {
  try {
    switch (args[0]) {
      case "on": return await setRecording(true, io, env);
      case "off": return await setRecording(false, io, env);
      case "status": return await status(io, env);
      case "server": io.stderr("qb-trace server is reserved but not implemented in this version"); return 2;
      default:
        io.stderr("usage: qb-trace <on|off|status|server>");
        return 2;
    }
  } catch (error) {
    io.stderr(`qb-trace failed: ${errorText(error)}`);
    return 1;
  }
}
