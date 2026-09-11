import { useInfiniteQuery } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import { traceApi } from "../../api/client";
import type { SessionSummary } from "../../types";

function sessionTitle(session: SessionSummary): string {
  if (session.cwd) return session.cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? session.cwd;
  return `Session ${shortId(session.sessionId)}`;
}

function shortId(value: string): string { return value.length > 10 ? value.slice(0, 10) : value; }

export function SessionSidebar({ onSelect }: { onSelect(id: string): void }) {
  const [search, setSearch] = useState("");
  const query = useInfiniteQuery({
    queryKey: ["sessions"],
    queryFn: ({ pageParam, signal }) => traceApi.sessions(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor,
  });
  const sessions = query.data?.pages.flatMap(page => page.items) ?? [];
  const needle = search.trim().toLowerCase();
  const visible = needle ? sessions.filter(item => [item.cwd, item.sessionId, item.provider, item.model].some(value => value?.toLowerCase().includes(needle))) : sessions;
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(".session-card")];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
    if (next) { event.preventDefault(); next.focus(); }
  };
  return <section className="session-library" aria-labelledby="sessions-heading">
    <div className="library-heading">
      <div><span className="eyebrow">本地追踪库</span><h1 id="sessions-heading">Session</h1><p>从开始到结束，查看每一段已记录的执行过程。</p></div>
      <span className="count-badge">已载入 {visible.length}</span>
    </div>
    <div className="session-search"><label className="sr-only" htmlFor="session-search">搜索已载入的 Session</label><span aria-hidden="true">⌕</span><input id="session-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索名称、ID、路径、provider 或 model" /></div>
    <div className="session-list" onKeyDown={navigate}>
      {query.isPending && <PaneMessage title="正在载入 Session…" />}
      {query.isError && <PaneMessage title="暂时无法读取 Session" detail={query.error.message} action={() => query.refetch()} />}
      {!query.isPending && !sessions.length && <PaneMessage title="还没有追踪记录" detail="开启记录后，启动一个 Pi Session。" />}
      {!query.isPending && sessions.length > 0 && !visible.length && <PaneMessage title="没有匹配的 Session" detail="搜索范围为已载入的 Session 页面。" />}
      {visible.map(session => <button key={session.sessionId} className="session-card" onClick={() => onSelect(session.sessionId)}>
        <span className="session-card-main"><span className="session-title">{sessionTitle(session)}</span><span className="session-id">#{shortId(session.sessionId)}</span><span className="session-path">{session.cwd ?? "工作目录不可用"}</span></span>
        <span className="session-context"><strong>{[session.provider, session.model].filter(Boolean).join(" · ") || "provider 信息不可用"}</strong><span>{session.agentRuns.toLocaleString()} 次运行 · {session.turns.toLocaleString()} 轮 · {session.toolCalls.toLocaleString()} 个工具</span></span>
        <span className="session-volume"><strong>{session.eventCount.toLocaleString()}</strong><span>个事件</span>{session.errors > 0 && <span className="error-text">{session.errors} 个错误</span>}</span>
        <span className="session-time"><span>最近活动</span><time>{new Date(session.lastTimestamp).toLocaleString()}</time></span>
        <span className="session-open" aria-hidden="true">→</span>
      </button>)}
      {query.hasNextPage && <button className="quiet-button load-more" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? "正在载入…" : "载入更早的 Session"}</button>}
    </div>
  </section>;
}

function PaneMessage({ title, detail, action }: { title: string; detail?: string; action?: () => void }) {
  return <div className="pane-message"><strong>{title}</strong>{detail && <span>{detail}</span>}{action && <button className="quiet-button" onClick={action}>重试</button>}</div>;
}
