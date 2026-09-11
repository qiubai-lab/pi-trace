import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceState } from "../../app/workspace-state";
import type { ExecutionFilters } from "../../../analysis/execution-contracts";
import { executionApi, executionStream } from "../../api/execution";
import { traceApi } from "../../api/client";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { Playback } from "./Playback";
import { ExecutionHeader } from "./ExecutionHeader";

type Update = (patch: Partial<WorkspaceState>, replace?: boolean) => void;
export function Workbench({
  workspace: w,
  update,
  recording,
}: {
  workspace: WorkspaceState;
  update: Update;
  recording: boolean;
}) {
  const session = w.sessionId!;
  const view = w.view ?? "execution";
  const [offset, setOffset] = useState(0);
  const [focus, setFocus] = useState(w.eventId);
  const [raw, setRaw] = useState(view === "events");
  const [width, setWidth] = useState(400);
  const [showInspector, setShowInspector] = useState(true);
  const [showPlayback, setShowPlayback] = useState(false);
  const [collapsedRuns, setCollapsedRuns] = useState<Set<string>>(() => new Set());
  const [live, setLive] = useState(false);
  const [connection, setConnection] = useState("关闭");
  const [pending, setPending] = useState(false);
  const [follow, setFollow] = useState(false);
  const [search, setSearch] = useState(w.search ?? "");
  const client = useQueryClient();
  const drag = useRef<{ x: number; width: number } | undefined>(undefined);
  const summary = useQuery({
    queryKey: ["session-summary", session],
    queryFn: ({ signal }) => traceApi.sessionSummary(session, signal),
  });
  const filters: ExecutionFilters = {
    sessionId: session,
    view,
    search: w.search,
    kind: w.kind,
    status: w.status,
    parentId: w.parent,
    from: w.from,
    to: w.to,
    at: w.at,
    offset,
    limit: 100,
    focus,
  };
  const query = useQuery({
    queryKey: ["execution", session, filters],
    queryFn: ({ signal }) => executionApi.page(filters, signal),
    gcTime: w.at === undefined ? 30_000 : 1_500,
    placeholderData: (previous, previousQuery) => {
      const previousFilters = previousQuery?.queryKey[2] as
        | ExecutionFilters
        | undefined;
      return w.at !== undefined &&
        previousFilters?.at !== undefined &&
        previousFilters.at < w.at &&
        previousFilters.sessionId === session &&
        previousFilters.view === view
        ? previous
        : undefined;
    },
    refetchInterval: (q) => (q.state.data?.indexing ? 500 : false),
  });
  const extent = useQuery({
    queryKey: ["execution-extent", session],
    queryFn: ({ signal }) =>
      executionApi.page({ sessionId: session, limit: 1 }, signal),
    refetchInterval: (q) => (q.state.data?.indexing ? 750 : false),
  });
  const data = query.data;
  const observedRevision = useRef(0);
  if (data) observedRevision.current = data.revision;
  const all = extent.data?.overview ?? data?.overview;
  const stats = w.at === undefined ? all : data?.overview;
  const apply = useCallback(
    (patch: Partial<WorkspaceState>) => {
      setOffset(0);
      setFocus(undefined);
      update(patch);
    },
    [update],
  );
  const select = (id: string, isRaw = false) => {
    setRaw(isRaw);
    setShowInspector(true);
    update({ eventId: id }, true);
  };
  useEffect(() => {
    setSearch(w.search ?? "");
  }, [w.search]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== (w.search ?? "")) apply({ search: search || undefined });
    }, 180);
    return () => clearTimeout(timer);
  }, [search, w.search, apply]);
  useEffect(() => {
    if (!live || w.at !== undefined) return;
    const controller = new AbortController();
    void executionStream(
      session,
      controller.signal,
      (change) => {
        if (!change.reset && change.revision <= observedRevision.current) return;
        if (change.reset) {
          setOffset(0);
          setFocus(undefined);
        }
        void client.invalidateQueries({
          queryKey: ["execution-extent", session],
        });
        void client.invalidateQueries({ queryKey: ["execution", session] });
        setPending(!change.reset);
      },
      setConnection,
    );
    return () => controller.abort();
  }, [session, live, w.at, client]);
  useEffect(() => {
    if (follow && pending && data) {
      setOffset(Math.max(0, Math.floor((data.total - 1) / 100) * 100));
      setFocus(undefined);
      setPending(false);
    }
  }, [follow, pending, data]);
  const onTime = useCallback(
    (at?: number) => {
      setLive(false);
      setFollow(false);
      setOffset(0);
      setFocus(at === undefined ? undefined : "@playhead");
      update({ at }, true);
    },
    [update],
  );
  const clear = () => {
    setSearch("");
    apply({
      search: undefined,
      kind: undefined,
      status: undefined,
      parent: undefined,
      from: undefined,
      to: undefined,
    });
  };
  const paging = (next: number) => {
    setFocus(undefined);
    setOffset(Math.max(0, next));
  };
  const busy = query.isFetching;
  const scoped = w.parent
    ? data?.items.find((item) => item.id === w.parent)
    : undefined;
  const scale = all
    ? {
        start: w.from ?? scoped?.start ?? all.start,
        end: w.to ?? scoped?.end ?? (w.parent ? w.at : undefined) ?? all.end,
      }
    : undefined;
  return (
    <section className="execution-workbench">
      <header className="session-heading">
        <div className="session-breadcrumb">
          <button
            onClick={() =>
              update({
                sessionId: undefined,
                eventId: undefined,
                view: undefined,
                search: undefined,
                kind: undefined,
                status: undefined,
                parent: undefined,
                from: undefined,
                to: undefined,
                at: undefined,
              })
            }
          >
            ← <span>Session</span>
          </button>
          <span className="breadcrumb-divider">/</span>
          <div>
            <h1>
              {summary.data?.cwd?.split("/").filter(Boolean).at(-1) ??
                "执行分析"}
            </h1>
            <span title={summary.data?.cwd}>
              {summary.data?.cwd ?? session}
            </span>
          </div>
        </div>
        <div className="session-heading-right">
          <span>
            {summary.data?.provider} / {summary.data?.model}
          </span>
          <button
            className={`live-toggle ${live ? "on" : ""}`}
            aria-pressed={live}
            onClick={() => {
              if (w.at !== undefined) onTime(undefined);
              setLive(!live);
            }}
          >
            ● {live ? connection : "开启 Live"}
          </button>
        </div>
      </header>
      <ExecutionHeader
        filters={{
          view,
          search,
          kind: w.kind,
          status: w.status,
          from: w.from,
          to: w.to,
          at: w.at,
        }}
        overview={stats}
        indexing={Boolean(data?.indexing)}
        pending={pending}
        live={live}
        follow={follow}
        onApply={apply}
        onSearch={setSearch}
        onView={(nextView) => {
          apply({
            view: nextView,
            ...(nextView === "events"
              ? { kind: undefined, status: undefined, parent: undefined }
              : {}),
          });
        }}
        onClear={clear}
        onOverview={() => apply({ from: undefined, to: undefined })}
        onPending={() => {
          setPending(false);
          paging(Math.max(0, Math.floor(((data?.total ?? 1) - 1) / 100) * 100));
        }}
        onFollow={setFollow}
        onToggleInspector={() => setShowInspector(!showInspector)}
        inspectorVisible={showInspector}
      />
      <div
        className={`execution-panels ${showInspector ? "" : "inspector-hidden"}`}
        style={{
          gridTemplateColumns: showInspector
            ? `210px minmax(280px,1fr) 5px ${width}px`
            : "210px minmax(280px,1fr)",
        }}
      >
        <nav className="execution-navigator" aria-label="运行与轮次">
          <div className="navigator-title">
            STRUCTURE <small>{data?.groups.length ?? 0}</small>
          </div>
          <button
            className={!w.parent ? "selected" : ""}
            onClick={() => apply({ parent: undefined })}
          >
            ◈ 全部运行
          </button>
          {data?.groups.map((group) => {
            if (group.kind === "turn" && group.parentId && collapsedRuns.has(group.parentId))
              return null;
            if (group.kind !== "run")
              return (
                <button
                  key={group.id}
                  title={group.id}
                  className={`nav-turn ${w.parent === group.id ? "selected" : ""}`}
                  onClick={() => apply({ parent: group.id })}
                >
                  ↳ {group.name}
                </button>
              );
            const collapsed = collapsedRuns.has(group.id);
            return (
              <div className="navigator-run" key={group.id}>
                <button
                  className="run-disclosure"
                  aria-label={`${collapsed ? "展开" : "收起"} ${group.name}`}
                  aria-expanded={!collapsed}
                  onClick={() =>
                    setCollapsedRuns((current) => {
                      const next = new Set(current);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                >
                  {collapsed ? "›" : "⌄"}
                </button>
                <button
                  title={group.id}
                  className={`nav-run ${w.parent === group.id ? "selected" : ""}`}
                  onClick={() => apply({ parent: group.id })}
                >
                  ◈ {group.name}
                </button>
              </div>
            );
          })}
          <div className="navigator-note">
            时间相邻 ≠ 因果关系
            <br />
            Skill 读取 ≠ 执行证明
          </div>
        </nav>
        <div className="execution-main" aria-busy={busy}>
          {query.isPending ? (
            <div className="empty-workbench">
              <div className="loading-ring" />
              <h3>正在还原执行过程</h3>
              <p>从原始事件构建可检索的操作索引</p>
            </div>
          ) : query.isError ? (
            <div className="empty-workbench" role="alert">
              <h3>读取失败</h3>
              <p>{query.error.message}</p>
              <button onClick={() => query.refetch()}>重试</button>
            </div>
          ) : (
            <Timeline
              data={data!}
              selected={w.eventId}
              onSelect={select}
              view={view}
              at={w.at}
              live={live}
              scale={scale}
            />
          )}
          <div className="window-pager">
            <span>
              {data?.total
                ? `${data.offset + 1}–${Math.min(data.offset + data.limit, data.total)} / ${data.total.toLocaleString()}`
                : "0 条记录"}{" "}
              {busy ? "· 更新中" : ""}
            </span>
            <div>
              <button
                disabled={!data?.offset}
                onClick={() => paging((data?.offset ?? 0) - 100)}
              >
                ← 上一窗口
              </button>
              <button
                disabled={!data || data.offset + data.limit >= data.total}
                onClick={() => paging((data?.offset ?? 0) + 100)}
              >
                下一窗口 →
              </button>
            </div>
          </div>
        </div>
        {showInspector && (
          <>
            <div
              className="panel-separator"
              role="separator"
              aria-label="调整详情宽度"
              aria-orientation="vertical"
              aria-valuemin={300}
              aria-valuemax={800}
              aria-valuenow={width}
              tabIndex={0}
              onPointerDown={(e) => {
                drag.current = { x: e.clientX, width };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (drag.current)
                  setWidth(
                    Math.max(
                      300,
                      Math.min(
                        800,
                        drag.current.width + drag.current.x - e.clientX,
                      ),
                    ),
                  );
              }}
              onPointerUp={(e) => {
                drag.current = undefined;
                e.currentTarget.releasePointerCapture(e.pointerId);
              }}
              onPointerCancel={() => {
                drag.current = undefined;
              }}
              onKeyDown={(e) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                ) {
                  e.preventDefault();
                  setWidth(
                    e.key === "Home"
                      ? 300
                      : e.key === "End"
                        ? 800
                        : Math.max(
                            300,
                            Math.min(
                              800,
                              width + (e.key === "ArrowLeft" ? 20 : -20),
                            ),
                          ),
                  );
                }
              }}
            />
            <Inspector
              selected={w.eventId}
              at={w.at}
              rawOnly={raw}
              onSelect={select}
              onClose={() => {
                update({ eventId: undefined }, true);
              }}
              revision={live ? (data?.revision ?? 0) : 0}
            />
          </>
        )}
      </div>
      {showPlayback && (
        <Playback
          session={session}
          busy={busy}
          start={all?.start ?? 0}
          end={all?.end ?? 0}
          at={w.at}
          onTime={onTime}
          onLive={() => {
            void query.refetch();
            setPending(false);
          }}
        />
      )}
      <div className="workbench-statusbar">
        <span>
          <i className={recording ? "recording-dot" : ""} />
          {recording ? "采集开启" : "采集关闭"} ·{" "}
          {live ? connection : "历史分析"}
        </span>
        <button
          className="playback-toggle"
          aria-expanded={showPlayback}
          aria-controls="history-playback"
          onClick={() => setShowPlayback(!showPlayback)}
        >
          {showPlayback ? "收起历史回放" : "展开历史回放"}
        </button>
        <span>LOCAL ONLY · 原始 Payload 未脱敏 · 索引可重建</span>
      </div>
    </section>
  );
}
