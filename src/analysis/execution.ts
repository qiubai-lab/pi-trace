import type { TraceEventDetail } from "../contracts.ts";
import type {
  Operation,
  OperationKind,
  OperationStatus,
} from "./execution-contracts.ts";

export function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
export function parsePayload(event: TraceEventDetail): Record<string, any> {
  try {
    return object(JSON.parse(event.payloadJson));
  } catch {
    return {};
  }
}
export function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((block) => {
        const b = object(block);
        return (
          b.text ?? b.thinking ?? (b.type === "image" ? "[记录的图片]" : "")
        );
      })
      .join("\n");
  return value === undefined ? "" : JSON.stringify(value);
}
export interface ProjectorState {
  requests: Record<string, string>;
  waits: Record<string, string>;
  messages: Record<string, string>;
  sequences: Record<string, number>;
  tools?: Record<string, string>;
}
/** Evidence-only reducer. Hook intervals include preflight/middleware, never pure execution. */
export class ExecutionProjector {
  state: ProjectorState;
  constructor(state?: ProjectorState) {
    this.state = state ?? {
      requests: {},
      waits: {},
      messages: {},
      sequences: {},
    };
  }
  project(
    e: TraceEventDetail,
    revision: number,
    get: (id: string) => Operation | undefined,
    open: () => Operation[] = () => [],
  ): Operation[] {
    const p = parsePayload(e);
    const type = e.eventType;
    const r = `${e.sessionId}:${e.runtimeId}`;
    const run = e.agentRunId ? `${r}:run:${e.agentRunId}` : undefined;
    const turn =
      run && e.turnIndex !== undefined
        ? `${run}:turn:${e.turnIndex}`
        : undefined;
    const parent = turn ?? run;
    const changes: Operation[] = [];
    const add = (
      id: string,
      kind: OperationKind,
      name: string,
      patch: Partial<Operation> = {},
    ) => {
      const previous = get(id);
      const operation: Operation = {
        id,
        sessionId: e.sessionId,
        runtimeId: e.runtimeId,
        parentId: parent,
        kind,
        name,
        summary: "",
        status: "observed",
        start: e.timestampMs,
        startSequence: e.sequence,
        source: "Pi 公共 hook · 观察值",
        incompleteStart: false,
        durationLabel: "观察区间（非纯执行时间）",
        agentRunId: e.agentRunId,
        turnIndex: e.turnIndex,
        ...previous,
        ...patch,
        revision,
        eventCount: (previous?.eventCount ?? 0) + 1,
        lastEventId: e.eventId,
        lastEventType: type,
      };
      changes.push(operation);
      return operation;
    };
    const lastSeq = this.state.sequences[r];
    if (lastSeq !== undefined && e.sequence > lastSeq + 1)
      add(`${r}:gap:${e.sequence}`, "gap", "事件序列缺口", {
        summary: `缺少 ${e.sequence - lastSeq - 1} 个序号 · 可能暂停或丢弃`,
        status: "incomplete",
        end: e.timestampMs,
      });
    this.state.sequences[r] = Math.max(lastSeq ?? 0, e.sequence);
    if (type === "trace_resources") {
      this.state.tools ??= {};
      for (const value of Array.isArray(p.tools) ? p.tools : []) {
        const tool = object(value);
        const source = object(tool.sourceInfo);
        if (typeof tool.name === "string")
          this.state.tools[`${r}:${tool.name}`] = String(
            source.path ?? source.source ?? "来源未知",
          );
      }
      add(`${e.eventId}:resources`, "system", "工具与 Skill 来源", {
        contentEventId: e.eventId,
        end: e.timestampMs,
        summary: "trace_resources · 可用来源快照，不代表已执行",
      });
    } else if (
      type === "before_agent_start" ||
      type === "agent_start" ||
      type === "agent_end"
    ) {
      if (run)
        add(run, "run", "Agent 运行", {
          parentId: undefined,
          status: type === "agent_end" ? "completed" : "running",
          ...(type === "agent_end" ? { end: e.timestampMs } : {}),
          summary: String(p.prompt ?? get(run)?.summary ?? "").slice(0, 200),
        });
      if (type === "before_agent_start")
        add(`${e.eventId}:system`, "system", "System prompt", {
          contentEventId: e.eventId,
          end: e.timestampMs,
          summary: "此 handler 观察到的系统上下文",
        });
    } else if (type === "turn_start" || type === "turn_end") {
      if (turn)
        add(turn, "turn", `Turn ${(e.turnIndex ?? 0) + 1}`, {
          parentId: run,
          status: type === "turn_end" ? "completed" : "running",
          ...(type === "turn_end" ? { end: e.timestampMs } : {}),
          incompleteStart: type === "turn_end" && !get(turn),
        });
    } else if (type === "before_provider_request") {
      const id = `${e.eventId}:request`;
      this.state.requests[r] = id;
      add(
        id,
        "request",
        `${e.provider ?? "provider"} / ${e.model ?? "model"}`,
        {
          status: "running",
          inputEventId: e.eventId,
          summary: "请求观察 → 消息完成；不是网络纯耗时",
        },
      );
    } else if (type === "after_provider_response") {
      const id = this.state.requests[r] ?? `${e.eventId}:request`;
      add(id, "request", "Provider response", {
        resultEventId: e.eventId,
        summary: `HTTP ${p.status ?? "未知"} · 响应到达，未据此判定流结束`,
        status: Number(p.status) >= 400 ? "error" : "running",
        incompleteStart: !get(id),
      });
    } else if (
      /^tool_(execution_start|execution_update|execution_end|call|result)$/.test(
        type,
      )
    ) {
      const call = e.toolCallId ?? p.toolCallId;
      const id = call ? `${r}:tool:${call}` : `${e.eventId}:tool`;
      const old = get(id);
      const name = String(p.toolName ?? old?.name ?? "Tool");
      const ends = type === "tool_execution_end";
      const result = ends || type === "tool_result";
      const input = p.args ?? p.input;
      const summary = text(
        input?.path ?? input?.command ?? old?.summary ?? "",
      ).slice(0, 240);
      const failed = p.isError === true || e.isError;
      add(id, "tool", name, {
        toolCallId: call,
        summary,
        source:
          this.state.tools?.[`${r}:${name}`] ??
          old?.source ??
          "工具生命周期 · 公共 hook",
        status: failed
          ? "error"
          : ends
            ? "completed"
            : old?.status === "error"
              ? "error"
              : "running",
        ...(input !== undefined && !old?.inputEventId
          ? { inputEventId: e.eventId }
          : {}),
        ...(result ? { resultEventId: e.eventId } : {}),
        ...(ends ? { end: e.timestampMs } : {}),
        incompleteStart:
          old?.incompleteStart ??
          !["tool_execution_start", "tool_call"].includes(type),
      });
    } else if (/^message_(start|update|end)$/.test(type)) {
      const message = object(p.message);
      const role = message.role;
      if (role === "toolResult") return changes; // toolResult duplicate is raw evidence, not another failure
      if (type === "message_start")
        this.state.messages[r] = e.messageId ?? e.eventId;
      const messageId = e.messageId ?? this.state.messages[r] ?? e.eventId;
      const blocks = Array.isArray(message.content)
        ? message.content
        : [{ text: text(message.content) }];
      blocks.forEach((raw: unknown, index: number) => {
        const b = object(raw);
        if (b.type === "toolCall") {
          const id = `${r}:tool:${b.id ?? `${messageId}:${index}`}`;
          if (!get(id))
            add(id, "tool", String(b.name ?? "Tool"), {
              inputEventId: e.eventId,
              blockIndex: index,
              toolCallId: b.id,
              summary: text(
                b.arguments?.path ?? b.arguments?.command ?? "",
              ).slice(0, 240),
            });
          return;
        }
        const kind: OperationKind =
          typeof b.thinking === "string"
            ? "thinking"
            : role === "user"
              ? "user"
              : role === "assistant"
                ? "assistant"
                : "system";
        add(
          `${r}:message:${messageId}:${index}`,
          kind,
          kind === "thinking"
            ? "可见 Thinking"
            : role === "user"
              ? "用户输入"
              : "Assistant 输出",
          {
            contentEventId: e.eventId,
            blockIndex: index,
            summary: text(
              b.text ??
                b.thinking ??
                (b.type === "image" ? "[记录的图片]" : ""),
            ).slice(0, 240),
            status:
              type === "message_end"
                ? message.stopReason === "error"
                  ? "error"
                  : message.stopReason === "aborted"
                    ? "incomplete"
                    : "completed"
                : "running",
            ...(type === "message_end" ? { end: e.timestampMs } : {}),
          },
        );
      });
      if (
        type === "message_end" &&
        role === "assistant" &&
        this.state.requests[r]
      ) {
        const id = this.state.requests[r];
        const old = get(id);
        if (old)
          add(id, "request", old.name, {
            summary: `${old.summary.split(" · ")[0] || "模型请求"} · 结束依据 message_end`,
            contentEventId: e.eventId,
            end: e.timestampMs,
            status:
              message.stopReason === "error"
                ? "error"
                : message.stopReason === "aborted"
                  ? "incomplete"
                  : "completed",
          });
        delete this.state.requests[r];
      }
    } else if (type === "qb_span") {
      const id = `${r}:span:${p.namespace}:${p.spanId}`;
      const ending = p.action === "span.end";
      const old = get(id);
      add(id, "span", String(p.name ?? old?.name ?? p.spanId), {
        parentId: p.parentSpanId
          ? `${r}:span:${p.namespace}:${p.parentSpanId}`
          : (old?.parentId ?? parent),
        source: `${p.namespace} · 显式埋点`,
        summary: text(p.attributes ?? old?.summary ?? "").slice(0, 240),
        contentEventId: e.eventId,
        status: ending
          ? p.status === "error"
            ? "error"
            : p.status === "cancelled"
              ? "incomplete"
              : "completed"
          : p.action === "span.start"
            ? "running"
            : (old?.status ?? "running"),
        ...(ending ? { end: e.timestampMs } : {}),
        incompleteStart: old?.incompleteStart ?? p.action !== "span.start",
      });
    } else if (
      [
        "ui_prompt_start",
        "ui_prompt_end",
        "session_before_compact",
        "session_compact",
        "session_compact_failed",
      ].includes(type)
    ) {
      const kind = type.startsWith("ui_") ? "wait" : "compaction";
      const key = `${r}:${kind}`;
      const start =
        type === "ui_prompt_start" || type === "session_before_compact";
      if (start) this.state.waits[key] = `${e.eventId}:${kind}`;
      const id = this.state.waits[key] ?? `${e.eventId}:${kind}`;
      add(id, kind, kind === "wait" ? "等待用户" : "上下文压缩", {
        contentEventId: e.eventId,
        summary: text(p.title ?? p.reason ?? ""),
        status: start
          ? "running"
          : type.endsWith("failed")
            ? "error"
            : "completed",
        ...(!start ? { end: e.timestampMs, incompleteStart: !get(id) } : {}),
      });
      if (!start) delete this.state.waits[key];
    } else if (!["before_provider_headers", "agent_settled"].includes(type)) {
      add(
        `${e.eventId}:event`,
        type === "trace_gap" ? "gap" : "system",
        type === "context"
          ? "模型上下文"
          : type === "trace_resources"
            ? "工具与 Skill 来源"
            : type,
        {
          contentEventId: e.eventId,
          end: e.timestampMs,
          status: type === "trace_gap" ? "incomplete" : "observed",
          summary: text(p.reason ?? p.text ?? p.command ?? "").slice(0, 240),
        },
      );
    }
    if (type === "session_shutdown" || type === "agent_end") {
      for (const pending of open()) {
        if (
          pending.id === run ||
          (type === "agent_end" && pending.agentRunId !== e.agentRunId)
        )
          continue;
        if (changes.some((change) => change.id === pending.id)) continue;
        add(pending.id, pending.kind, pending.name, {
          status: "incomplete",
          summary: pending.summary || "运行已结束，但未观察到此操作的结束边界",
        });
      }
    }
    return changes;
  }
}
