import { useQuery } from "@tanstack/react-query";
import { traceApi } from "../../api/client";

const formatBytes = (bytes: number) => {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1000 && index < units.length - 1) { value /= 1000; index++; }
  return `${index ? value.toFixed(1) : value} ${units[index]}`;
};

export function SessionContextBar({ sessionId, live, liveState, onToggleLive }: { sessionId: string; live: boolean; liveState: "off" | "connecting" | "live" | "error"; onToggleLive(): void }) {
  const query = useQuery({ queryKey: ["session-summary", sessionId], queryFn: ({ signal }) => traceApi.sessionSummary(sessionId, signal) });
  if (query.isPending) return <div className="session-context-bar skeleton" aria-label="正在载入 Session 上下文" />;
  if (query.isError) return <div className="summary-error" role="alert">无法载入 Session 信息 · <button onClick={() => query.refetch()}>重试</button></div>;
  const item = query.data;
  const stats = [["事件", item.eventCount.toLocaleString()], ["工具", item.toolCalls], ["错误", item.errors]];
  const liveLabel = liveState === "error" ? "重新连接" : liveState === "connecting" ? "正在连接" : live ? "实时更新" : "开启实时";
  return <section className="session-context-bar" aria-label="Session 上下文">
    <div className="compact-session-identity"><strong title={item.cwd ?? item.sessionId}>{item.cwd ?? item.sessionId}</strong><span>{[item.provider, item.model].filter(Boolean).join(" · ") || "provider 信息不可用"}</span></div>
    <div className="compact-stats">{stats.map(([label, value]) => <span className={`compact-stat ${label === "错误" && Number(value) > 0 ? "has-error" : ""}`} key={label}><b>{value}</b><small>{label}</small></span>)}</div>
    <button className={`live-button ${live ? "is-active" : ""}`} onClick={onToggleLive}><span className="status-dot" />{liveLabel}</button>
  </section>;
}

export { formatBytes };
