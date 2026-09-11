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
      <div><span className="eyebrow">Trace library</span><h1 id="sessions-heading">Sessions</h1><p>Select a recorded Session to follow its execution from start to finish.</p></div>
      <span className="count-badge">{visible.length} loaded</span>
    </div>
    <div className="session-search"><label className="sr-only" htmlFor="session-search">Search loaded Sessions</label><input id="session-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by title, ID, path, provider, or model" /></div>
    <div className="session-list" onKeyDown={navigate}>
      {query.isPending && <PaneMessage title="Loading sessions…" />}
      {query.isError && <PaneMessage title="Sessions unavailable" detail={query.error.message} action={() => query.refetch()} />}
      {!query.isPending && !sessions.length && <PaneMessage title="No traces yet" detail="Enable recording and start a Pi session." />}
      {!query.isPending && sessions.length > 0 && !visible.length && <PaneMessage title="No matching Sessions" detail="Search checks the loaded Session pages." />}
      {visible.map(session => <button key={session.sessionId} className="session-card" onClick={() => onSelect(session.sessionId)}>
        <span className="session-card-main"><span className="session-title">{sessionTitle(session)}</span><span className="session-id">#{shortId(session.sessionId)}</span><span className="session-path">{session.cwd ?? "Working directory unavailable"}</span></span>
        <span className="session-context"><strong>{[session.provider, session.model].filter(Boolean).join(" · ") || "Provider context unavailable"}</strong><span>{session.agentRuns.toLocaleString()} runs · {session.turns.toLocaleString()} turns · {session.toolCalls.toLocaleString()} tools</span></span>
        <span className="session-volume"><strong>{session.eventCount.toLocaleString()}</strong><span>events</span>{session.errors > 0 && <span className="error-text">{session.errors} errors</span>}</span>
        <span className="session-time"><span>Last activity</span><time>{new Date(session.lastTimestamp).toLocaleString()}</time></span>
        <span className="session-open" aria-hidden="true">→</span>
      </button>)}
      {query.hasNextPage && <button className="quiet-button load-more" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>{query.isFetchingNextPage ? "Loading…" : "Load older Sessions"}</button>}
    </div>
  </section>;
}

function PaneMessage({ title, detail, action }: { title: string; detail?: string; action?: () => void }) {
  return <div className="pane-message"><strong>{title}</strong>{detail && <span>{detail}</span>}{action && <button className="quiet-button" onClick={action}>Try again</button>}</div>;
}
