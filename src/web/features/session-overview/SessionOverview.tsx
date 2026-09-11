import { useQuery } from "@tanstack/react-query";
import { traceApi } from "../../api/client";

const formatBytes = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) { value /= 1000; index++; }
  return `${index ? value.toFixed(1) : value} ${units[index]}`;
};

export function SessionOverview({ sessionId }: { sessionId: string }) {
  const query = useQuery({ queryKey: ["session-summary", sessionId], queryFn: ({ signal }) => traceApi.sessionSummary(sessionId, signal) });
  if (query.isPending) return <div className="summary-strip skeleton" aria-label="Loading Session summary" />;
  if (query.isError) return <div className="summary-error" role="alert">Summary unavailable · <button onClick={() => query.refetch()}>Retry</button></div>;
  const item = query.data;
  const stats = [
    ["Events", item.eventCount.toLocaleString()], ["Payload", formatBytes(item.payloadBytes)], ["Agent runs", item.agentRuns],
    ["Turns", item.turns], ["Tools", item.toolCalls], ["Errors", item.errors],
  ];
  return <section className="summary-strip" aria-label="Session summary">
    <div className="session-identity"><span className="eyebrow">Current Session</span><strong>{item.cwd ?? item.sessionId}</strong><span>{[item.provider, item.model].filter(Boolean).join(" · ") || "Provider context unavailable"}</span></div>
    {stats.map(([label, value]) => <div className={`summary-stat ${label === "Errors" && Number(value) > 0 ? "has-error" : ""}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}
  </section>;
}

export { formatBytes };
