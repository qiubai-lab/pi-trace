import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceState } from "../../app/workspace-state";
import type { ExecutionFilters } from "../../../analysis/execution-contracts";
import { executionApi, executionStream } from "../../api/execution";
import { traceApi } from "../../api/client";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { Playback } from "./Playback";
import { duration, kindLabel } from "./presentation";

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
      <div className="workbench-intro">
        <div>
          <span className="section-eyebrow">EXECUTION EXPLORER</span>
          <h2>
            每一步，都有迹可循<span>.</span>
          </h2>
        </div>
        <div className="execution-stats">
          <Stat
            label={w.at === undefined ? "原始事件" : "已发生事件"}
            value={stats?.events}
          />
          <Stat label="操作 / 边界" value={stats?.operations} />
          <Stat label="失败操作" value={stats?.errors} error />
          <Stat label="记录缺口" value={stats?.gaps} />
        </div>
      </div>
      <div className="activity-strip" aria-label="全局活动概览">
        <div className="activity-label">
          <span>SESSION ACTIVITY</span>
          <b>{all ? duration(all.end - all.start) : "—"}</b>
        </div>
        <div className="activity-bins">
          {(all?.bins ?? Array(64).fill(0)).map((value, i) => (
            <button
              key={i}
              aria-label={`查看第 ${i + 1} 段活动，${value} 个事件`}
              title={`${value} 个事件`}
              className={
                w.from !== undefined &&
                all &&
                Math.abs(
                  w.from - (all.start + ((all.end - all.start) * i) / 64),
                ) < 1
                  ? "active"
                  : ""
              }
              onClick={() => {
                if (all)
                  apply({
                    from: all.start + ((all.end - all.start) * i) / 64,
                    to: all.start + ((all.end - all.start) * (i + 1)) / 64,
                  });
              }}
            >
              <span
                style={{
                  transform: `scaleY(${Math.max(0.07, Math.log1p(value) / Math.max(1, Math.log1p(Math.max(...(all?.bins ?? [1])))))})`,
                }}
              />
            </button>
          ))}
        </div>
        <button
          className="overview-reset"
          onClick={() => apply({ from: undefined, to: undefined })}
        >
          全范围 ↗
        </button>
      </div>
      <div className="execution-toolbar">
        <div className="view-tabs" role="tablist" aria-label="分析视图">
          {(
            [
              ["execution", "◈", "执行"],
              ["conversation", "≡", "对话"],
              ["events", "⌁", "事件"],
            ] as const
          ).map(([v, icon, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => {
                apply({
                  view: v,
                  ...(v === "events"
                    ? { kind: undefined, status: undefined, parent: undefined }
                    : {}),
                });
              }}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        <div className="trace-search">
          <span>⌕</span>
          <input
            aria-label="搜索操作"
            placeholder={
              view === "events"
                ? "搜索事件类型 / ID…"
                : "搜索工具、路径、内容、插件…"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="操作类型"
          disabled={view === "events"}
          value={w.kind ?? ""}
          onChange={(e) => apply({ kind: e.target.value || undefined })}
        >
          <option value="">所有类型</option>
          {Object.entries(kindLabel).map(([k, label]) => (
            <option value={k} key={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="操作状态"
          disabled={view === "events"}
          value={w.status ?? ""}
          onChange={(e) => apply({ status: e.target.value || undefined })}
        >
          <option value="">所有状态</option>
          <option value="error">失败</option>
          <option value="running">未观察到结束</option>
          <option value="incomplete">不完整</option>
          <option value="completed">已完成</option>
        </select>
        <button className="filter-clear" onClick={clear}>
          重置
        </button>
        <button
          aria-label="切换详情面板"
          aria-pressed={showInspector}
          onClick={() => setShowInspector(!showInspector)}
        >
          ▣
        </button>
      </div>
      <div className="window-status">
        <span>
          {w.at !== undefined
            ? "◷ 历史回放 · 仅显示此时刻已记录的证据"
            : "公共 hook + 显式埋点 · 跨运行时按观察时间排列"}
          {data?.indexing ? " · 正在构建索引…" : ""}
        </span>
        <div>
          {(w.search ||
            w.kind ||
            w.status ||
            w.parent ||
            w.from !== undefined) && (
            <span className="filter-indicator">筛选已生效</span>
          )}
          {pending && (
            <button
              onClick={() => {
                setPending(false);
                paging(
                  Math.max(0, Math.floor(((data?.total ?? 1) - 1) / 100) * 100),
                );
              }}
            >
              新记录已到达 ↓
            </button>
          )}
          {live && (
            <label>
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
              />
              跟随最新
            </label>
          )}
        </div>
      </div>
      <div
        className={`execution-panels ${showInspector ? "" : "inspector-hidden"}`}
        style={{
          gridTemplateColumns: showInspector
            ? `160px minmax(280px,1fr) 5px ${width}px`
            : "160px minmax(280px,1fr)",
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
          {data?.groups.map((group) => (
            <button
              key={group.id}
              title={group.id}
              className={`${group.kind === "turn" ? "nav-turn" : "nav-run"} ${w.parent === group.id ? "selected" : ""}`}
              onClick={() => apply({ parent: group.id })}
            >
              {group.kind === "turn" ? "↳" : "◈"} {group.name}
            </button>
          ))}
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
      <div className="workbench-statusbar">
        <span>
          <i className={recording ? "recording-dot" : ""} />
          {recording ? "采集开启" : "采集关闭"} ·{" "}
          {live ? connection : "历史分析"}
        </span>
        <span>LOCAL ONLY · 原始 Payload 未脱敏 · 索引可重建</span>
      </div>
    </section>
  );
}
function Stat({
  value,
  label,
  error,
}: {
  value?: number;
  label: string;
  error?: boolean;
}) {
  return (
    <div className={`execution-stat ${error && value ? "error-stat" : ""}`}>
      <b>{value?.toLocaleString() ?? "—"}</b>
      <span>{label}</span>
    </div>
  );
}
