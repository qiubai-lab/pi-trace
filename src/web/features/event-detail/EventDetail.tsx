import { useQuery } from "@tanstack/react-query";
import { useId, useMemo, useState } from "react";
import Markdown from "react-markdown";
import { traceApi } from "../../api/client";
import type { EventDetail as EventDetailData } from "../../types";
import { formatBytes } from "../session-overview/SessionOverview";
import { eventDetailModel, type EventDetailModel } from "./event-detail-model";

type DetailTab = "review" | "metadata" | "raw";

function formatPayload(source: string): string {
  try { return JSON.stringify(JSON.parse(source), null, 2); } catch { return source; }
}

export function EventDetail({ eventId, onClose, variant = "pane" }: { eventId?: string; onClose(): void; variant?: "pane" | "popover" }) {
  const [tab, setTab] = useState<DetailTab>("review");
  const tabId = useId();
  const query = useQuery({ queryKey: ["event", eventId], queryFn: ({ signal }) => traceApi.event(eventId!, signal), enabled: Boolean(eventId) });
  const model = useMemo(() => query.data ? eventDetailModel(query.data) : undefined, [query.data]);
  const rawPayload = useMemo(() => query.data ? formatPayload(query.data.payloadJson) : "", [query.data]);

  if (!eventId) return <aside className="detail-pane"><div className="pane-header"><div><span className="eyebrow">事件详情</span><h2>已记录的 Payload</h2></div></div><div className="detail-empty"><span className="detail-icon">⌁</span><strong>选择一个事件</strong><p>仅在你打开时才会载入元数据和完整 Payload。</p></div></aside>;
  return <aside className={`detail-pane ${variant === "popover" ? "detail-popover-surface" : ""}`} aria-label="事件详情" role={variant === "popover" ? "dialog" : undefined} aria-modal={variant === "popover" ? "true" : undefined}>
    <div className="pane-header"><span className="eyebrow">事件详情</span><button className="icon-button" aria-label="关闭事件详情" onClick={onClose}>×</button></div>
    {query.isPending && <div className="detail-empty"><strong>正在载入 Payload…</strong></div>}
    {query.isError && <div className="detail-empty" role="alert"><strong>暂时无法读取 Payload</strong><p>{query.error.message}</p><button className="quiet-button" onClick={() => query.refetch()}>重试</button></div>}
    {query.data && model && <div className="detail-workspace">
      <div className="detail-tabs" role="tablist" aria-label="事件详情视图">
        <Tab id={`${tabId}-review`} panelId={`${tabId}-panel-review`} selected={tab === "review"} onSelect={() => setTab("review")}>审阅视图</Tab>
        <Tab id={`${tabId}-metadata`} panelId={`${tabId}-panel-metadata`} selected={tab === "metadata"} onSelect={() => setTab("metadata")}>事件信息</Tab>
        <Tab id={`${tabId}-raw`} panelId={`${tabId}-panel-raw`} selected={tab === "raw"} onSelect={() => setTab("raw")}>原始 Payload</Tab>
      </div>
      <div className="detail-tab-panel" role="tabpanel" id={`${tabId}-panel-${tab}`} aria-labelledby={`${tabId}-${tab}`}>
        {tab === "review" && <StructuredDetail model={model} genericContent={rawPayload} />}
        {tab === "metadata" && <Metadata event={query.data} />}
        {tab === "raw" && <pre className="payload raw-payload" tabIndex={0}>{rawPayload}</pre>}
      </div>
    </div>}
  </aside>;
}

function Tab({ id, panelId, selected, onSelect, children }: { id: string; panelId: string; selected: boolean; onSelect(): void; children: string }) {
  return <button id={id} role="tab" aria-selected={selected} aria-controls={panelId} tabIndex={selected ? 0 : -1} onClick={onSelect}>{children}</button>;
}

function StructuredDetail({ model, genericContent }: { model: EventDetailModel; genericContent: string }) {
  if (model.kind === "tool") return <section className={`event-detail-card tool-detail ${model.isError ? "is-error" : ""}`}><div className="detail-kind"><span>工具</span><strong>{model.toolName}</strong><em>{model.status}</em></div>{model.input !== undefined && <ReadableBlock label="输入参数" value={model.input} />}{model.result !== undefined && <ReadableBlock label={model.isError ? "错误结果" : "调用结果"} value={model.result || "未记录结果内容"} />}</section>;
  if (model.kind === "generic") return <section className="event-detail-card generic-detail"><div className="detail-kind"><span>事件</span><strong>{model.title}</strong></div><pre className="payload structured-payload" tabIndex={0}>{genericContent}</pre></section>;
  return <section className={`event-detail-card message-detail detail-${model.kind}`}><div className="detail-kind"><span>{model.label}</span><strong>{model.title}</strong></div><ReadableBlock label={model.label} value={model.content} /></section>;
}

function ReadableBlock({ label, value }: { label: string; value: string }) {
  const [textMode, setTextMode] = useState(false);
  return <section className="detail-block"><div className="detail-block-heading"><div className="segmented content-mode" role="group" aria-label={`${label}显示方式`}><button aria-pressed={!textMode} onClick={() => setTextMode(false)}>Markdown 渲染</button><button aria-pressed={textMode} onClick={() => setTextMode(true)}>文本原文</button></div></div>
    {textMode ? <pre className="detail-plaintext" tabIndex={0}>{value}</pre> : <div className="markdown-content"><Markdown>{value}</Markdown></div>}
  </section>;
}

function Metadata({ event }: { event: EventDetailData }) {
  return <section className="event-metadata"><h3>事件信息</h3><dl className="metadata-grid">
    <Meta label="时间" value={new Date(event.timestamp).toLocaleString()} /><Meta label="大小" value={formatBytes(event.payloadBytes)} />
    <Meta label="运行环境" value={event.runtimeId} /><Meta label="Agent 运行" value={event.agentRunId ?? "—"} />
    <Meta label="轮次" value={event.turnIndex?.toString() ?? "—"} /><Meta label="工具调用" value={event.toolCallId ?? "—"} />
  </dl></section>;
}
function Meta({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>; }
