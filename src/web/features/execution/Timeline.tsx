import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useQuery } from "@tanstack/react-query";
import type {
  ExecutionPage,
  Operation,
} from "../../../analysis/execution-contracts";
import { executionApi } from "../../api/execution";
import { duration, icons, kindLabel, statusLabel, time } from "./presentation";

export function Timeline({
  data,
  selected,
  onSelect,
  view,
  at,
  live,
  scale,
}: {
  data: ExecutionPage;
  selected?: string;
  onSelect(id: string, raw?: boolean): void;
  view: string;
  at?: number;
  live: boolean;
  scale?: { start: number; end: number };
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<string>();
  const observedRevision = useRef(data.revision);
  const [recent, setRecent] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const previous = observedRevision.current;
    observedRevision.current = data.revision;
    setRecent(
      new Set(
        live && data.revision > previous
          ? data.items.filter((op) => op.revision > previous).map((op) => op.id)
          : [],
      ),
    );
    const timer = setTimeout(() => setRecent(new Set()), 1_500);
    return () => clearTimeout(timer);
  }, [data.revision, live]);
  const events = view === "events" ? (data.events ?? []) : undefined;
  const count = events?.length ?? data.items.length;
  const virtual = useVirtualizer({
    count,
    getScrollElement: () => viewport.current,
    estimateSize: () => (view === "conversation" ? 100 : 64),
    overscan: 5,
  });
  useEffect(() => {
    viewport.current?.scrollTo?.({ top: 0 });
  }, [data.offset, view]);
  const selectedIndex = events
    ? events.findIndex((e) => e.id === selected)
    : data.items.findIndex((e) => e.id === selected);
  const move = (direction: number) => {
    const i = Math.max(0, Math.min(count - 1, selectedIndex + direction));
    const id = events?.[i]?.id ?? data.items[i]?.id;
    if (id) {
      onSelect(id, Boolean(events));
      virtual.scrollToIndex(i);
    }
  };
  const start = scale?.start ?? data.overview.start;
  const end = Math.max(start + 1, scale?.end ?? data.overview.end);
  const range = end - start;
  const cursor =
    at === undefined
      ? undefined
      : Math.max(0, Math.min(100, ((at - start) / range) * 100));
  return (
    <div
      className="trace-table"
      role="region"
      aria-label={events ? "原始事件列表" : "执行时间线"}
    >
      <div className="trace-columns">
        <span>{events ? "事件 / 观察点" : "操作 / 证据"}</span>
        <div className="time-ruler">
          <span>{time(start)}</span>
          <span>+{duration(range / 2)}</span>
          <span>+{duration(range)}</span>
        </div>
      </div>
      <div
        ref={viewport}
        className="trace-scroll"
        tabIndex={0}
        aria-label="执行列表，方向键切换操作"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            move(e.key === "ArrowDown" ? 1 : -1);
          }
        }}
      >
        {!count && (
          <div className="empty-workbench">
            <span>⌕</span>
            <h3>当前范围没有记录</h3>
            <p>尝试清除筛选、调整回放时刻，或等待索引完成。</p>
          </div>
        )}
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((row) => {
            const event = events?.[row.index];
            const op = data.items[row.index];
            const id = event?.id ?? op.id;
            const rowStart = event?.timestamp ?? op.start;
            return (
              <div
                key={id}
                data-index={row.index}
                ref={virtual.measureElement}
                className={`trace-row ${selected === id ? "selected" : ""} ${view === "conversation" ? "reading-row" : ""}`}
                style={{
                  position: "absolute",
                  width: "100%",
                  transform: `translateY(${row.start}px)`,
                }}
              >
                <div className="trace-row-line">
                  <div className="operation-cell">
                    {!event && (
                      <button
                        className="disclose"
                        aria-label={`展开 ${op.name} 的原始事件`}
                        aria-expanded={expanded === id}
                        onClick={() =>
                          setExpanded(expanded === id ? undefined : id)
                        }
                      >
                        {expanded === id ? "⌄" : "›"}
                      </button>
                    )}
                    <button
                      className="operation-select"
                      aria-pressed={selected === id}
                      onClick={() => onSelect(id, Boolean(event))}
                    >
                      <span
                        className={`operation-symbol kind-${event ? "system" : op.kind}`}
                      >
                        {event ? "·" : icons[op.kind]}
                      </span>
                      <span className="operation-copy">
                        <span className="operation-title">
                          {event?.type ?? op.name}
                        </span>
                        <span className="operation-summary">
                          {event
                            ? `${event.runtimeId.slice(0, 8)} · #${event.sequence} · ${time(event.timestamp)}`
                            : op.summary ||
                              `${kindLabel[op.kind]} · ${op.eventCount} 个关联事件`}
                        </span>
                      </span>
                      {!event && (
                        <span className={`operation-state state-${op.status}`}>
                          {statusLabel[op.status]}
                        </span>
                      )}
                    </button>
                  </div>
                  <button
                    className="waterfall-cell"
                    aria-label={`定位 ${event?.type ?? op.name}`}
                    onClick={() => onSelect(id, Boolean(event))}
                  >
                    <span className="waterfall-grid" />
                    {cursor !== undefined && (
                      <span
                        className="replay-cursor"
                        style={{ left: `${cursor}%` }}
                      />
                    )}
                    <span
                      className={`time-bar kind-${event ? "system" : op.kind} ${!event && op.status === "running" && live && recent.has(op.id) ? "active-bar" : ""} ${!event && op.status === "error" ? "error-bar" : ""}`}
                      style={{
                        left: `${Math.max(0, ((rowStart - start) / range) * 100)}%`,
                        width: `${Math.max(0.6, (((event ? rowStart : (op.end ?? Math.min(at ?? end, end))) - rowStart) / range) * 100)}%`,
                      }}
                    />
                    <span className="bar-duration">
                      {!event && op.end !== undefined
                        ? duration(op.end - op.start)
                        : !event && op.status === "running"
                          ? "未观察到结束"
                          : "观察点"}
                    </span>
                  </button>
                </div>
                {view === "conversation" && !event && (
                  <p className="reading-preview">
                    {op.summary || "选择此操作阅读完整内容"}
                  </p>
                )}
                {expanded === id && !event && (
                  <EvidenceRows
                    operation={op}
                    at={at}
                    onSelect={(eventId) => onSelect(eventId, true)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function EvidenceRows({
  operation,
  at,
  onSelect,
}: {
  operation: Operation;
  at?: number;
  onSelect(id: string): void;
}) {
  const query = useQuery({
    queryKey: ["evidence", operation.id, operation.revision, at],
    queryFn: ({ signal }) =>
      executionApi.inspect(operation.id, at, false, 0, signal),
  });
  return (
    <div className="inline-evidence">
      {query.isPending ? (
        "载入关联事件…"
      ) : query.isError ? (
        "无法载入关联事件"
      ) : (
        <>
          {query.data.events.slice(0, 8).map((e) => (
            <button key={e.id} onClick={() => onSelect(e.id)}>
              <code>#{e.sequence}</code>
              <span>{e.type}</span>
              <time>{time(e.timestamp)}</time>
            </button>
          ))}
          {query.data.totalEvents > 8 && (
            <small>
              共 {query.data.totalEvents} 个事件 · 在 Inspector
              的关联事件中继续浏览
            </small>
          )}
        </>
      )}
    </div>
  );
}
