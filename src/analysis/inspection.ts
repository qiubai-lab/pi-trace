import type { TraceEventDetail } from "../contracts.ts";
import type {
  ContentSection,
  Operation,
  OperationDetail,
  RawSlice,
} from "./execution-contracts.ts";
import { object, parsePayload, text } from "./execution.ts";
import type { ExecutionEvent } from "./execution-contracts.ts";
export interface InspectionReader {
  operation(id: string, at?: number): Operation | undefined;
  resolveEvent(id: string): string | undefined;
  event(id: string): TraceEventDetail | undefined;
  evidence(
    id: string,
    at?: number,
    offset?: number,
  ): { items: ExecutionEvent[]; total: number };
  previousContent(op: Operation, at?: number): TraceEventDetail | undefined;
  artifactEvents?(id: string, at?: number): string[];
  children?(id: string, at?: number): Operation[];
}

const MAX_TEXT = 24_000;
const SECRET_KEY =
  /authorization|cookie|api[-_]?key|password|secret|access[-_]?token|refresh[-_]?token/i;
export function mask(value: unknown, key = ""): unknown {
  if (SECRET_KEY.test(key)) return "[已遮蔽]";
  if (typeof value === "string")
    return value.replace(/Bearer\s+[A-Za-z0-9._~+\/=-]+/gi, "Bearer [已遮蔽]")
      .replace(/("(?:authorization|cookie|api[-_]?key|password|secret|access[-_]?token|refresh[-_]?token)"\s*:\s*")(?:\\.|[^"\\])*(?:"|$)/gi, '$1[已遮蔽]"');
  if (Array.isArray(value)) return value.map((v) => mask(v));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, mask(v, k)]),
    );
  return value;
}
export function maskOperation(op: Operation): Operation {
  return { ...op, name: mask(op.name) as string, summary: mask(op.summary) as string, source: mask(op.source) as string };
}
export function rawSlice(
  event: TraceEventDetail,
  offset = 0,
  reveal = false,
): RawSlice {
  let payload: unknown;
  try {
    payload = JSON.parse(event.payloadJson);
  } catch {
    payload = event.payloadJson;
  }
  const source = JSON.stringify(reveal ? payload : mask(payload), null, 2);
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    observationStage: event.observationStage,
    offset,
    totalChars: source.length,
    text: source.slice(offset, offset + MAX_TEXT),
    masked: !reveal,
  };
}
export function sectionsFor(
  op: Operation,
  read: (id: string) => TraceEventDetail | undefined,
  reveal = false,
  slice?: { id: string; offset: number },
): ContentSection[] {
  const result: ContentSection[] = [];
  let budget = 128_000;
  let imageBudget = 1_000_000;
  const add = (
    event: TraceEventDetail,
    label: string,
    value: unknown,
    format: ContentSection["format"] = "text",
    extra: Partial<ContentSection> = {},
  ) => {
    if (budget <= 0) return;
    const safe = reveal ? value : mask(value);
    const source =
      typeof safe === "string" ? safe : (JSON.stringify(safe, null, 2) ?? "");
    const allowance = Math.min(MAX_TEXT, budget);
    const sectionId = `${event.eventId}:${result.length}`;
    const offset = slice?.id === sectionId ? slice.offset : 0;
    const section = {
      id: sectionId,
      label,
      format,
      text: source.slice(offset, offset + allowance),
      truncated: source.length > allowance,
      totalChars: source.length,
      eventId: event.eventId,
      ...extra,
    };
    if (section.before) section.before = section.before.slice(0, allowance);
    if (section.after) section.after = section.after.slice(0, allowance);
    budget -=
      section.text.length +
      (section.before?.length ?? 0) +
      (section.after?.length ?? 0) +
      1;
    result.push(section);
  };
  const image = (event: TraceEventDetail, b: Record<string, any>) => {
    const data = b.data ?? b.source?.data;
    const mime = b.mimeType ?? b.source?.mediaType;
    if (
      typeof data === "string" &&
      data.length <= imageBudget &&
      /^image\/(png|jpeg|gif|webp)$/.test(mime) &&
      /^[A-Za-z0-9+/=\s]+$/.test(data)
    ) {
      imageBudget -= data.length;
      result.push({
        id: `${event.eventId}:image:${result.length}`,
        label: "记录的图片",
        format: "image",
        text: data,
        mime,
        eventId: event.eventId,
      });
    } else
      add(
        event,
        "图片附件",
        "附件过大、未记录内容或格式不支持；不会读取当前本地路径或外部 URL。",
      );
  };
  if (op.inputEventId) {
    const event = read(op.inputEventId);
    if (event) {
      const p = parsePayload(event);
      const block = Array.isArray(p.message?.content)
        ? object(p.message.content[op.blockIndex ?? -1])
        : {};
      const args = p.args ?? p.input ?? block.arguments ?? p.payload ?? p;
      if (op.kind === "tool" && op.name === "edit") {
        add(event, "文件路径", object(args).path ?? "未记录");
        const edits =
          object(args).edits ??
          (object(args).oldText !== undefined ? [args] : []);
        for (const edit of (Array.isArray(edits) ? edits : []).slice(0, 50)) {
          const b = object(edit);
          add(event, "请求的修改块（不代表实际文件快照）", "", "diff", {
            before: String(
              reveal ? (b.oldText ?? "") : mask(b.oldText ?? ""),
            ).slice(0, MAX_TEXT),
            after: String(
              reveal ? (b.newText ?? "") : mask(b.newText ?? ""),
            ).slice(0, MAX_TEXT),
            truncated:
              String(b.oldText ?? "").length > MAX_TEXT ||
              String(b.newText ?? "").length > MAX_TEXT,
          });
        }
      } else
        add(
          event,
          op.kind === "request" ? "请求观察值" : "输入参数",
          args,
          "json",
        );
    }
  }
  if (op.resultEventId) {
    const event = read(op.resultEventId);
    if (event) {
      const p = parsePayload(event);
      const payload = p.result ?? p;
      if (Array.isArray(payload.content)) {
        for (const raw of payload.content.slice(0, 100)) {
          const b = object(raw);
          if (b.type === "image") image(event, b);
          else if (b.text !== undefined) add(event, "工具输出", b.text);
        }
      } else
        add(
          event,
          "结果观察值",
          payload.content ?? payload,
          typeof payload.content === "string" ? "text" : "json",
        );
      if (payload.details !== undefined)
        add(event, "结果 Details", payload.details, "json");
    }
  }
  if (op.contentEventId) {
    const event = read(op.contentEventId);
    if (event) {
      const p = parsePayload(event);
      if (op.blockIndex !== undefined && p.message) {
        const blocks = Array.isArray(p.message.content)
          ? p.message.content
          : [{ text: text(p.message.content) }];
        const block = object(blocks[op.blockIndex]);
        if (block.type === "image") image(event, block);
        else
          add(
            event,
            op.kind === "thinking" ? "已记录的可见 Thinking" : "内容",
            block.thinking ?? block.text ?? block,
            block.text !== undefined || block.thinking !== undefined
              ? "markdown"
              : "json",
          );
      } else if (event.eventType === "before_agent_start") {
        add(
          event,
          "System prompt · 当前 handler 观察值",
          p.systemPrompt,
          "markdown",
        );
        if (p.systemPromptOptions)
          add(event, "上下文来源与可用 Skills", p.systemPromptOptions, "json");
      } else if (event.eventType === "qb_span") {
        add(event, "显式埋点", p, "json");
        if (p.action === "artifact.attach") {
          const a = object(p.artifact);
          if (a.type === "image") image(event, a);
          else
            add(
              event,
              a.name ?? "记录的产物",
              a.text ?? a,
              a.type === "markdown"
                ? "markdown"
                : ["json", "file", "diff"].includes(a.type)
                  ? "json"
                  : "text",
            );
        }
      } else
        add(
          event,
          event.eventType === "context"
            ? "模型上下文 · 当前观察点"
            : "事件内容",
          p,
          "json",
        );
    }
  }
  return result;
}
export function inspectOperation(
  index: InspectionReader,
  id: string,
  at?: number,
  reveal = false,
  evidenceOffset = 0,
  slice?: { id: string; offset: number },
): OperationDetail | undefined {
  const resolved = index.operation(id, at) ? id : index.resolveEvent(id);
  const op = resolved ? index.operation(resolved, at) : undefined;
  if (!op) return undefined;
  const read = (eventId: string) => {
    const e = index.event(eventId);
    return e && (at === undefined || e.timestampMs <= at) ? e : undefined;
  };
  const sections = sectionsFor(op, read, reveal, slice);
  const evidence = index.evidence(op.id, at, evidenceOffset);
  let artifactBudget = 1_000_000;
  for (const eventId of index.artifactEvents?.(op.id, at) ?? []) {
    if (eventId === op.contentEventId) continue;
    const artifacts = sectionsFor(
      {
        ...op,
        inputEventId: undefined,
        resultEventId: undefined,
        contentEventId: eventId,
      },
      read,
      reveal,
    );
    for (const section of artifacts.filter(
      (section) => section.label !== "显式埋点",
    )) {
      if (section.text.length > artifactBudget) break;
      sections.push(section);
      artifactBudget -= section.text.length;
    }
  }
  const relations: OperationDetail["relations"] = [];
  if (op.parentId) {
    const parent = index.operation(op.parentId, at);
    if (parent)
      relations.push({
        id: parent.id,
        name: parent.name,
        relation: "归属（非因果推断）",
      });
  }
  for (const child of index.children?.(op.id, at) ?? [])
    relations.push({
      id: child.id,
      name: child.name,
      relation: child.kind === "span" ? "显式子步骤" : "下级操作",
    });
  if (["context", "before_agent_start"].includes(op.lastEventType)) {
    const previous = index.previousContent(op, at);
    const current = read(op.contentEventId ?? "");
    if (previous && current) {
      relations.push({
        id: index.resolveEvent(previous.eventId) ?? previous.eventId,
        name: "上一观察点",
        relation: "内容比较（不归因于特定插件）",
      });
      const old = parsePayload(previous);
      const next = parsePayload(current);
      const a = reveal
        ? (old.systemPrompt ?? old.messages ?? old)
        : mask(old.systemPrompt ?? old.messages ?? old);
      const b = reveal
        ? (next.systemPrompt ?? next.messages ?? next)
        : mask(next.systemPrompt ?? next.messages ?? next);
      const before = text(a);
      const after = text(b);
      sections.push({
        id: "context-diff",
        label: "相邻观察点差异（前后对照）",
        format: "diff",
        text: "",
        before: before.slice(0, MAX_TEXT),
        after: after.slice(0, MAX_TEXT),
        truncated: before.length > MAX_TEXT || after.length > MAX_TEXT,
        eventId: current.eventId,
      });
    }
  }
  const warnings = [
    "只反映已采集的公共 hook / 显式埋点；不代表 Pi 内部全部步骤。",
    "敏感字段遮蔽是阅读保护，不是完整脱敏；原始数据仍保存在本机。",
    "内容与附件预览有界；完整事实可在关联事件 / Raw 中分段读取。",
  ];
  if (op.incompleteStart) warnings.push("未观察到开始边界，耗时不完整。");
  if (op.status === "running")
    warnings.push("尚未观察到结束；历史记录可能中断，不能据此断言仍在执行。");
  if (op.kind === "tool")
    warnings.push(
      "此区间包含预检和中间件，不是工具纯执行耗时；读取 SKILL.md 不等于执行该 Skill。",
    );
  return {
    operation: reveal ? op : maskOperation(op),
    sections,
    events: evidence.items,
    totalEvents: evidence.total,
    relations,
    warnings,
  };
}
