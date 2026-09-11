import type { EventDetail } from "../../types";

export type EventDetailModel =
  | { kind: "user" | "assistant" | "thinking" | "system"; title: string; label: string; content: string }
  | { kind: "tool"; title: string; toolName: string; status: "等待中" | "已完成" | "错误"; input?: string; result?: string; isError: boolean }
  | { kind: "generic"; title: string; content: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.flatMap(block => {
    const item = record(block);
    if (!item) return [];
    if (typeof item.text === "string") return [item.text];
    if (typeof item.thinking === "string") return [item.thinking];
    return [];
  }).join("\n");
}

function messageModel(payload: Record<string, unknown>): EventDetailModel | undefined {
  const message = record(payload.message);
  if (!message) return undefined;
  const role = message.role;
  const blocks = Array.isArray(message.content) ? message.content : [message.content];
  const thinking = blocks.map(record).find(block => typeof block?.thinking === "string")?.thinking;
  if (typeof thinking === "string") return { kind: "thinking", title: "思考过程", label: "思考", content: thinking };
  const text = contentText(message.content);
  if (role === "user") return { kind: "user", title: "用户输入", label: "输入", content: text || "未记录文本内容" };
  if (role === "assistant") return { kind: "assistant", title: "Assistant 输出", label: "输出", content: text || "未记录文本内容" };
  return { kind: "system", title: "系统消息", label: "系统", content: text || "未记录文本内容" };
}

export function eventDetailModel(event: EventDetail): EventDetailModel {
  let payload: Record<string, unknown> | undefined;
  try { payload = record(JSON.parse(event.payloadJson)); } catch { /* generic fallback below */ }
  if (!payload) return { kind: "generic", title: event.eventType, content: event.payloadJson };

  if (event.eventType === "message_end") return messageModel(payload) ?? { kind: "generic", title: event.eventType, content: stringify(payload) };
  if (event.eventType === "before_agent_start" && typeof payload.systemPrompt === "string") {
    return { kind: "system", title: "系统上下文", label: "System prompt", content: payload.systemPrompt };
  }
  if (event.eventType === "user_bash" && typeof payload.command === "string") {
    return { kind: "user", title: "Shell 输入", label: "命令", content: payload.command };
  }
  if (event.eventType === "tool_execution_start") {
    const toolName = typeof payload.toolName === "string" ? payload.toolName : "Tool";
    return { kind: "tool", title: "工具调用", toolName, status: "等待中", input: stringify(payload.args), isError: false };
  }
  if (event.eventType === "tool_result") {
    const toolName = typeof payload.toolName === "string" ? payload.toolName : "Tool";
    const isError = event.isError || payload.isError === true;
    return { kind: "tool", title: "工具结果", toolName, status: isError ? "错误" : "已完成", result: contentText(payload.content) || stringify(payload.details), isError };
  }
  return { kind: "generic", title: event.eventType, content: stringify(payload) };
}
