import type { ExtensionAPI, ExtensionContext, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { TraceCollector } from "./collector.ts";
import { RecordingConfigStore, RecordingGate } from "./config.ts";
import { RuntimeDiagnosticsStore } from "./diagnostics.ts";
import { CorrelationState, type TraceContextSnapshot } from "./events.ts";
import { resolveTracePaths } from "./paths.ts";
import { TraceStore } from "./store.ts";

export interface QbTraceOptions {
  env?: NodeJS.ProcessEnv;
  flushIntervalMs?: number;
  enabledOverride?: boolean;
}

interface Runtime {
  correlation: CorrelationState;
  collector: TraceCollector;
  diagnostics: RuntimeDiagnosticsStore;
  gate?: RecordingGate;
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

  const start = async (ctx: ExtensionContext): Promise<Runtime> => {
    if (runtime) return runtime;
    const correlation = new CorrelationState();
    const diagnostics = new RuntimeDiagnosticsStore(paths.diagnostics, correlation.runtimeId);
    const collector = new TraceCollector({
      writer: () => new TraceStore(paths.database),
      diagnostics,
      enabled: options.enabledOverride ?? false,
      flushIntervalMs: options.flushIntervalMs,
    });
    const created: Runtime = { correlation, collector, diagnostics };
    runtime = created;
    if (options.enabledOverride === undefined) {
      const gate = new RecordingGate(
        new RecordingConfigStore(paths.config, true),
        enabled => collector.setEnabled(enabled),
      );
      created.gate = gate;
      await gate.start();
    }
    return created;
  };

  const record = async (event: ExtensionEvent, ctx: ExtensionContext): Promise<void> => {
    const active = runtime ?? await start(ctx);
    try {
      if (event.type === "before_agent_start") active.correlation.beginAgent();
      if (event.type === "agent_start") active.correlation.ensureAgent();
      if (event.type === "turn_start") active.correlation.beginTurn(event.turnIndex);
      if (event.type === "message_start") active.correlation.beginMessage();

      active.collector.enqueue(active.correlation.envelope(event.type, event, contextSnapshot(ctx), event.type));

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
    if (active.collector.isEnabled()) await active.collector.flush();
  });

  for (const eventName of OBSERVED_EVENTS) {
    (pi.on as (name: string, handler: (event: ExtensionEvent, ctx: ExtensionContext) => Promise<void>) => void)(
      eventName,
      async (event, ctx) => { await record(event, ctx); },
    );
  }

  pi.on("session_shutdown", async (event, ctx) => {
    if (!runtime) return;
    await record(event, ctx);
    runtime.gate?.stop();
    await runtime.collector.stop(1_800);
    runtime = undefined;
  });
}

export default function qbTrace(pi: ExtensionAPI): void {
  registerQbTrace(pi);
}
