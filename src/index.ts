import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { TraceCollector } from "./collector.ts";
import { RecordingConfigStore, RecordingGate } from "./config.ts";
import { RuntimeDiagnosticsStore } from "./diagnostics.ts";
import { CorrelationState, type TraceContextSnapshot } from "./events.ts";
import { resolveTracePaths } from "./paths.ts";
import { WorkerTraceWriter } from "./storage/worker-writer.ts";
import { TRACE_BUS_EVENT, validTraceSignal } from "./instrumentation.ts";
import { createTraceStorageStatsReader, TraceStatusController } from "./status.ts";

export interface QbTraceOptions {
  env?: NodeJS.ProcessEnv;
  flushIntervalMs?: number;
  statusIntervalMs?: number;
  enabledOverride?: boolean;
}

interface Runtime {
  correlation: CorrelationState;
  collector: TraceCollector;
  diagnostics: RuntimeDiagnosticsStore;
  gate?: RecordingGate;
  status?: TraceStatusController;
}

const OBSERVED_EVENTS = [
  "resources_discover", "session_info_changed", "session_before_switch", "session_before_fork",
  "session_before_compact", "session_compact", "session_compact_failed", "session_before_tree", "session_tree",
  "context", "before_provider_request", "before_provider_headers", "after_provider_response",
  "before_agent_start", "agent_start", "agent_end", "agent_settled", "ui_prompt_start", "ui_prompt_end",
  "turn_start", "turn_end", "message_start", "message_update", "message_end",
  "tool_execution_start", "tool_execution_update", "tool_execution_end", "model_select",
  "thinking_level_select", "tool_call", "tool_result", "user_bash", "input",
] as const;

function contextSnapshot(ctx: ExtensionContext): TraceContextSnapshot {
  const model = ctx.model;
  return {
    sessionId: ctx.sessionManager.getSessionId(),
    sessionFile: ctx.sessionManager.getSessionFile(),
    cwd: ctx.cwd,
    provider: model?.provider,
    model: model?.id,
    thinkingLevel: ctx.thinkingLevel,
  };
}

export function registerQbTrace(pi: ExtensionAPI, options: QbTraceOptions = {}): void {
  const paths = resolveTracePaths(options.env);
  let runtime: Runtime | undefined;
  let latestContext: ExtensionContext | undefined;
  const snapshots = { count: 0, totalMs: 0, maxMs: 0 };
  let resourceSignature = "";

  const start = async (ctx: ExtensionContext): Promise<Runtime> => {
    if (runtime) return runtime;
    const correlation = new CorrelationState();
    const diagnostics = new RuntimeDiagnosticsStore(paths.diagnostics, correlation.runtimeId);
    const collector = new TraceCollector({
      writer: () => new WorkerTraceWriter(paths.database),
      diagnostics,
      enabled: options.enabledOverride ?? false,
      flushIntervalMs: options.flushIntervalMs,
    });
    const status = ctx.mode === "tui"
      ? new TraceStatusController(ctx, createTraceStorageStatsReader(paths.database), options.statusIntervalMs)
      : undefined;
    const created: Runtime = { correlation, collector, diagnostics, status };
    runtime = created;
    await status?.start(collector.isEnabled());
    if (options.enabledOverride === undefined) {
      const gate = new RecordingGate(
        new RecordingConfigStore(paths.config, true),
        async enabled => {
          const wasEnabled = collector.isEnabled();
          if (!enabled && wasEnabled) collector.enqueue(correlation.envelope("trace_gap", { reason: "暂停记录 · 后续区间不会采集" }, contextSnapshot(latestContext ?? ctx)));
          const transition = collector.setEnabled(enabled);
          if (enabled && !wasEnabled) collector.enqueue(correlation.envelope("trace_gap", { reason: "开始/恢复记录 · 此前区间可能未采集" }, contextSnapshot(latestContext ?? ctx)));
          status?.setEnabled(enabled);
          await transition;
        },
      );
      created.gate = gate;
      await gate.start();
    }
    return created;
  };

  const record = async (event: ExtensionEvent, ctx: ExtensionContext): Promise<void> => {
    latestContext = ctx;
    const active = runtime ?? await start(ctx);
    try {
      if (event.type === "before_agent_start") active.correlation.beginAgent();
      if (event.type === "agent_start") active.correlation.ensureAgent();
      if (event.type === "turn_start") active.correlation.beginTurn(event.turnIndex);
      if (event.type === "message_start") active.correlation.beginMessage();

      // Keep correlation current while disabled, but avoid serializing sensitive/large payloads.
      if (active.collector.isEnabled()) {
        const started = performance.now();
        active.collector.enqueue(active.correlation.envelope(event.type, event, contextSnapshot(ctx), event.type));
        const elapsed = performance.now() - started; snapshots.count++; snapshots.totalMs += elapsed; snapshots.maxMs = Math.max(snapshots.maxMs, elapsed);
        if (event.type === "before_provider_request" && typeof pi.getAllTools === "function") {
          const tools = pi.getAllTools(); const signature = JSON.stringify(tools);
          if (signature !== resourceSignature) {
            resourceSignature = signature;
            active.collector.enqueue(active.correlation.envelope("trace_resources", { tools, commands: typeof pi.getCommands === "function" ? pi.getCommands() : [], note: "请求前可用工具来源快照；不代表 Skill 已执行" }, contextSnapshot(ctx)));
          }
        }
      }

      if (event.type === "message_end") active.correlation.endMessage();
      if (event.type === "turn_end") active.correlation.endTurn();
      if (event.type === "agent_end") active.correlation.endAgent();
    } catch (error) {
      active.diagnostics.recordError(error);
    }
  };

  pi.on("session_start", async (event, ctx) => {
    const active = await start(ctx);
    await record(event, ctx);
    // Make an enabled session-start durable promptly without blocking on every event.
    if (active.collector.isEnabled()) {
      if (typeof pi.getAllTools === "function") {
        active.collector.enqueue(active.correlation.envelope("trace_resources", {
          tools: pi.getAllTools(), commands: typeof pi.getCommands === "function" ? pi.getCommands() : [],
          note: "可用来源快照；不代表每个 skill 已执行",
        }, contextSnapshot(ctx)));
      }
      await active.collector.flush();
    }
  });

  for (const eventName of OBSERVED_EVENTS) {
    (pi.on as (name: string, handler: (event: ExtensionEvent, ctx: ExtensionContext) => Promise<void>) => void)(
      eventName,
      async (event, ctx) => { await record(event, ctx); },
    );
  }

  const onSignal = (value: unknown) => {
    if (!validTraceSignal(value) || !runtime?.collector.isEnabled() || !latestContext) return;
    try { runtime.collector.enqueue(runtime.correlation.envelope("qb_span", value, contextSnapshot(latestContext), "cooperative")); }
    catch (error) { runtime.diagnostics.recordError(error); }
  };
  const unsubscribe = pi.events?.on(TRACE_BUS_EVENT, onSignal);

  pi.on("session_shutdown", async (event, ctx) => {
    if (!runtime) return;
    if (runtime.collector.isEnabled()) runtime.collector.enqueue(runtime.correlation.envelope("trace_metrics", { snapshots, collector: runtime.collector.metrics(), note: "快照为同步观察成本；写入耗时包含 Worker 往返，不含最终 shutdown flush" }, contextSnapshot(ctx)));
    await record(event, ctx);
    runtime.gate?.stop();
    runtime.status?.stop();
    await runtime.collector.stop(1_800);
    runtime = undefined;
    latestContext = undefined;
    if (typeof unsubscribe === "function") unsubscribe();
  });
}

export default function qbTrace(pi: ExtensionAPI): void {
  registerQbTrace(pi);
}
