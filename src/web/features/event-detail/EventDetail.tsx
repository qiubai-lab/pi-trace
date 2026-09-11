import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { traceApi } from "../../api/client";
import { formatBytes } from "../session-overview/SessionOverview";

export function EventDetail({ eventId, onClose, variant = "pane" }: { eventId?: string; onClose(): void; variant?: "pane" | "popover" }) {
  const [mode, setMode] = useState<"structured" | "raw">("structured");
  const [structured, setStructured] = useState("");
  const query = useQuery({ queryKey: ["event", eventId], queryFn: ({ signal }) => traceApi.event(eventId!, signal), enabled: Boolean(eventId) });
  useEffect(() => {
    if (!query.data || mode !== "structured") return;
    const source = query.data.payloadJson;
    if (source.length < 64_000 || typeof Worker === "undefined") {
      try { setStructured(JSON.stringify(JSON.parse(source), null, 2)); } catch { setStructured(source); }
      return;
    }
    setStructured("正在格式化大型 Payload…");
    const worker = new Worker(new URL("./json-format.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => setStructured(String(event.data));
    worker.onerror = () => setStructured(source);
    worker.postMessage(source);
    return () => worker.terminate();
  }, [query.data, mode]);
  if (!eventId) return <aside className="detail-pane"><div className="pane-header"><div><span className="eyebrow">事件详情</span><h2>已记录的 Payload</h2></div></div><div className="detail-empty"><span className="detail-icon">⌁</span><strong>选择一个事件</strong><p>仅在你打开时才会载入元数据和完整 Payload。</p></div></aside>;
  return <aside className={`detail-pane ${variant === "popover" ? "detail-popover-surface" : ""}`} aria-label="事件详情" role={variant === "popover" ? "dialog" : undefined} aria-modal={variant === "popover" ? "false" : undefined}>
    <div className="pane-header"><div><span className="eyebrow">事件详情</span><h2>{query.data?.eventType ?? "正在载入事件…"}</h2></div><button className="icon-button" aria-label="关闭事件详情" onClick={onClose}>×</button></div>
    {query.isPending && <div className="detail-empty"><strong>正在载入 Payload…</strong></div>}
    {query.isError && <div className="detail-empty" role="alert"><strong>暂时无法读取 Payload</strong><p>{query.error.message}</p><button className="quiet-button" onClick={() => query.refetch()}>重试</button></div>}
    {query.data && <div className="detail-content">
      <dl className="metadata-grid">
        <Meta label="时间" value={new Date(query.data.timestamp).toLocaleString()} />
        <Meta label="大小" value={formatBytes(query.data.payloadBytes)} />
        <Meta label="运行环境" value={query.data.runtimeId} />
        <Meta label="Agent 运行" value={query.data.agentRunId ?? "—"} />
        <Meta label="轮次" value={query.data.turnIndex?.toString() ?? "—"} />
        <Meta label="工具调用" value={query.data.toolCallId ?? "—"} />
      </dl>
      <div className="payload-toolbar"><strong>Payload</strong><div className="segmented compact" role="group" aria-label="Payload 视图"><button aria-pressed={mode === "structured"} onClick={() => setMode("structured")}>结构化</button><button aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>原始内容</button></div></div>
      <pre className="payload" tabIndex={0}>{mode === "structured" ? structured : query.data.payloadJson}</pre>
    </div>}
  </aside>;
}
function Meta({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>; }
