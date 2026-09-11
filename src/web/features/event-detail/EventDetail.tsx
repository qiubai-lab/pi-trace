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
    setStructured("Formatting large payload…");
    const worker = new Worker(new URL("./json-format.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => setStructured(String(event.data));
    worker.onerror = () => setStructured(source);
    worker.postMessage(source);
    return () => worker.terminate();
  }, [query.data, mode]);
  if (!eventId) return <aside className="detail-pane"><div className="pane-header"><div><span className="eyebrow">Event detail</span><h2>Recorded payload</h2></div></div><div className="detail-empty"><span className="detail-icon">⌁</span><strong>Select an Event</strong><p>Metadata and the complete recorded payload load only when you ask for them.</p></div></aside>;
  return <aside className={`detail-pane ${variant === "popover" ? "detail-popover-surface" : ""}`} aria-label="Event detail" role={variant === "popover" ? "dialog" : undefined} aria-modal={variant === "popover" ? "false" : undefined}>
    <div className="pane-header"><div><span className="eyebrow">Event detail</span><h2>{query.data?.eventType ?? "Loading Event…"}</h2></div><button className="icon-button" aria-label="Close Event detail" onClick={onClose}>×</button></div>
    {query.isPending && <div className="detail-empty"><strong>Loading payload…</strong></div>}
    {query.isError && <div className="detail-empty" role="alert"><strong>Payload unavailable</strong><p>{query.error.message}</p><button className="quiet-button" onClick={() => query.refetch()}>Try again</button></div>}
    {query.data && <div className="detail-content">
      <dl className="metadata-grid">
        <Meta label="Time" value={new Date(query.data.timestamp).toLocaleString()} />
        <Meta label="Size" value={formatBytes(query.data.payloadBytes)} />
        <Meta label="Runtime" value={query.data.runtimeId} />
        <Meta label="Agent run" value={query.data.agentRunId ?? "—"} />
        <Meta label="Turn" value={query.data.turnIndex?.toString() ?? "—"} />
        <Meta label="Tool call" value={query.data.toolCallId ?? "—"} />
      </dl>
      <div className="payload-toolbar"><strong>Payload</strong><div className="segmented compact" role="group" aria-label="Payload mode"><button aria-pressed={mode === "structured"} onClick={() => setMode("structured")}>Structured</button><button aria-pressed={mode === "raw"} onClick={() => setMode("raw")}>Raw</button></div></div>
      <pre className="payload" tabIndex={0}>{mode === "structured" ? structured : query.data.payloadJson}</pre>
    </div>}
  </aside>;
}
function Meta({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd title={value}>{value}</dd></div>; }
