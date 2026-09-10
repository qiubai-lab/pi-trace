import { existsSync } from "node:fs";
import { RecordingConfigStore } from "./config.ts";
import { RuntimeDiagnosticsStore, summarizeDiagnostics } from "./diagnostics.ts";
import { resolveTracePaths } from "./paths.ts";
import { TraceQueryService } from "./query.ts";
import { DATABASE_SCHEMA_VERSION, TraceStore, traceDatabaseSize } from "./store.ts";

export interface CliIO { stdout(text: string): void; stderr(text: string): void; }

export interface CliRuntimeOptions {
  pruneGraceMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  compactDatabase?: (store: TraceStore) => void;
}

interface PruneArguments {
  beforeTimestampMs?: number;
  dryRun: boolean;
  vacuum: boolean;
}

const defaultIO: CliIO = { stdout: text => process.stdout.write(`${text}\n`), stderr: text => process.stderr.write(`${text}\n`) };
const PRUNE_USAGE = "usage: qb-trace prune (--older-than <Nh|Nd> | --all) [--dry-run] [--vacuum]";

function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function parsePruneArguments(args: string[], now: number): PruneArguments {
  let selector: "older" | "all" | undefined;
  let beforeTimestampMs: number | undefined;
  let dryRun = false;
  const vacuum = true;
  let vacuumFlagSeen = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--older-than") {
      if (selector) throw new Error("prune requires exactly one selector");
      const duration = args[++index];
      const match = duration?.match(/^([1-9]\d*)(h|d)$/);
      if (!match) throw new Error("--older-than must be a positive duration such as 12h or 30d");
      const amount = Number(match[1]);
      const milliseconds = amount * (match[2] === "h" ? 60 * 60 * 1_000 : 24 * 60 * 60 * 1_000);
      if (!Number.isSafeInteger(milliseconds)) throw new Error("--older-than duration is too large");
      selector = "older";
      beforeTimestampMs = now - milliseconds;
    } else if (argument === "--all") {
      if (selector) throw new Error("prune requires exactly one selector");
      selector = "all";
    } else if (argument === "--dry-run") {
      if (dryRun) throw new Error("duplicate --dry-run");
      dryRun = true;
    } else if (argument === "--vacuum") {
      if (vacuumFlagSeen) throw new Error("duplicate --vacuum");
      vacuumFlagSeen = true;
    } else {
      throw new Error(`unknown prune argument: ${argument ?? ""}`);
    }
  }
  if (!selector) throw new Error("prune requires --older-than or --all");
  return { beforeTimestampMs, dryRun, vacuum };
}

function reportPrune(
  io: CliIO,
  result: { matchedEvents: number; payloadBytes: number; remainingEvents: number; beforeSize: number; afterSize: number },
  dryRun: boolean,
): void {
  if (dryRun) io.stdout("dry run: true");
  io.stdout(`matched events: ${result.matchedEvents}`);
  if (!dryRun) io.stdout(`deleted events: ${result.matchedEvents}`);
  io.stdout(`${dryRun ? "matched" : "deleted"} payload bytes: ${result.payloadBytes}`);
  io.stdout(`remaining events: ${result.remainingEvents}`);
  io.stdout(`database size: ${result.beforeSize} bytes -> ${result.afterSize} bytes`);
}

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

async function prune(
  args: string[],
  io: CliIO,
  env: NodeJS.ProcessEnv,
  runtime: CliRuntimeOptions,
): Promise<number> {
  const paths = resolveTracePaths(env);
  let parsed: PruneArguments;
  try {
    parsed = parsePruneArguments(args, (runtime.now ?? Date.now)());
  } catch (error) {
    io.stderr(errorText(error));
    io.stderr(PRUNE_USAGE);
    return 2;
  }

  const beforeSize = traceDatabaseSize(paths.database);
  if (parsed.dryRun && !existsSync(paths.database)) {
    reportPrune(io, { matchedEvents: 0, payloadBytes: 0, remainingEvents: 0, beforeSize, afterSize: beforeSize }, true);
    return 0;
  }

  if (parsed.dryRun) {
    const store = new TraceStore(paths.database, { readOnly: true });
    try {
      const selected = store.eventStats(parsed.beforeTimestampMs);
      reportPrune(io, {
        matchedEvents: selected.eventCount,
        payloadBytes: selected.payloadBytes,
        remainingEvents: store.countEvents(),
        beforeSize,
        afterSize: traceDatabaseSize(paths.database),
      }, true);
      return 0;
    } finally {
      store.close();
    }
  }

  const config = new RecordingConfigStore(paths.config, true);
  const initiallyEnabled = (await config.load()).enabled;
  let automaticPauseRevision: string | undefined;
  if (initiallyEnabled) {
    await config.setEnabled(false);
    try {
      automaticPauseRevision = await config.revision();
    } catch (error) {
      await config.setEnabled(true);
      throw error;
    }
    io.stdout("recording: temporarily paused");
  }

  try {
    const graceMs = runtime.pruneGraceMs ?? 2_500;
    if (graceMs > 0) await (runtime.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))))(graceMs);
    if ((await config.load()).enabled) {
      io.stderr("prune aborted: recording was enabled during the shutdown grace period");
      return 1;
    }
    if (!existsSync(paths.database)) {
      reportPrune(io, { matchedEvents: 0, payloadBytes: 0, remainingEvents: 0, beforeSize, afterSize: beforeSize }, false);
      return 0;
    }

    const store = new TraceStore(paths.database, { timeoutMs: 2_000 });
    let deleted: ReturnType<TraceStore["pruneEvents"]>;
    let compactError: unknown;
    try {
      if (initiallyEnabled) store.appendControl(false, "qb-trace-cli:prune");
      deleted = store.pruneEvents(parsed.beforeTimestampMs);
      if (parsed.vacuum) {
        try {
          (runtime.compactDatabase ?? (target => target.checkpointAndVacuum()))(store);
        } catch (error) {
          compactError = error;
        }
      }
    } finally {
      store.close();
    }
    const afterSize = traceDatabaseSize(paths.database);
    reportPrune(io, {
      matchedEvents: deleted.deletedEvents,
      payloadBytes: deleted.deletedPayloadBytes,
      remainingEvents: deleted.remainingEvents,
      beforeSize,
      afterSize,
    }, false);
    if (parsed.vacuum) io.stdout(`vacuum: ${compactError ? "failed" : "complete"}`);
    if (compactError) {
      io.stderr(`events were deleted, but database compaction failed: ${errorText(compactError)}`);
      return 1;
    }
    return 0;
  } finally {
    if (initiallyEnabled && automaticPauseRevision) {
      let currentRevision: string;
      let currentEnabled: boolean;
      try {
        currentRevision = await config.revision();
        currentEnabled = (await config.load()).enabled;
      } catch (error) {
        io.stderr(`recording state could not be verified after prune: ${errorText(error)}`);
        throw error;
      }
      if (currentRevision === automaticPauseRevision) {
        try {
          await config.setEnabled(true);
        } catch (error) {
          io.stderr(`recording could not be restored; run qb-trace on: ${errorText(error)}`);
          throw error;
        }
        io.stdout("recording: restored on");
        if (existsSync(paths.database)) {
          try {
            const audit = new TraceStore(paths.database, { timeoutMs: 2_000 });
            try { audit.appendControl(true, "qb-trace-cli:prune"); } finally { audit.close(); }
          } catch (error) {
            io.stderr(`recording was restored, but its audit boundary could not be stored: ${errorText(error)}`);
            throw error;
          }
        }
      } else {
        io.stdout(`recording: concurrent change preserved (${currentEnabled ? "on" : "off"})`);
      }
    }
  }
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

export async function runCli(
  args: string[],
  io: CliIO = defaultIO,
  env: NodeJS.ProcessEnv = process.env,
  runtime: CliRuntimeOptions = {},
): Promise<number> {
  try {
    switch (args[0]) {
      case "on": return await setRecording(true, io, env);
      case "off": return await setRecording(false, io, env);
      case "status": return await status(io, env);
      case "prune": return await prune(args.slice(1), io, env, runtime);
      case "server": io.stderr("qb-trace server is reserved but not implemented in this version"); return 2;
      default:
        io.stderr("usage: qb-trace <on|off|status|prune|server>");
        return 2;
    }
  } catch (error) {
    io.stderr(`qb-trace failed: ${errorText(error)}`);
    return 1;
  }
}
