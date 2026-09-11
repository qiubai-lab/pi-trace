import type { ExecutionFilters, ExecutionPage } from "../../../analysis/execution-contracts";
import { duration, kindLabel } from "./presentation";

type WorkspaceFilters = Pick<
  ExecutionFilters,
  "view" | "search" | "kind" | "status" | "from" | "to" | "at"
>;

export function ExecutionHeader({
  filters,
  overview,
  indexing,
  pending,
  live,
  follow,
  onApply,
  onSearch,
  onView,
  onClear,
  onOverview,
  onPending,
  onFollow,
  onToggleInspector,
  inspectorVisible,
}: {
  filters: WorkspaceFilters;
  overview?: ExecutionPage["overview"];
  indexing: boolean;
  pending: boolean;
  live: boolean;
  follow: boolean;
  onApply: (patch: Partial<WorkspaceFilters>) => void;
  onSearch: (value: string) => void;
  onView: (view: NonNullable<WorkspaceFilters["view"]>) => void;
  onClear: () => void;
  onOverview: () => void;
  onPending: () => void;
  onFollow: (follow: boolean) => void;
  onToggleInspector: () => void;
  inspectorVisible: boolean;
}) {
  const filtered = Boolean(
    filters.search ||
      filters.kind ||
      filters.status ||
      filters.from !== undefined,
  );

  return (
    <section className="execution-header" aria-label="执行概览与筛选">
      <div className="execution-overview">
        <div className="execution-title">
          <span className="section-eyebrow">EXECUTION EXPLORER</span>
          <h2>
            每一步，都有迹可循<span>.</span>
          </h2>
        </div>
        <div className="execution-stats">
          <Stat
            label={filters.at === undefined ? "原始事件" : "已发生事件"}
            value={overview?.events}
          />
          <Stat label="操作 / 边界" value={overview?.operations} />
          <Stat label="失败操作" value={overview?.errors} error />
          <Stat label="记录缺口" value={overview?.gaps} />
        </div>
      </div>
      <div className="execution-controls">
        <div className="activity-overview" aria-label="全局活动概览">
          <span className="activity-duration">
            {overview ? duration(overview.end - overview.start) : "—"}
          </span>
          <div className="activity-bins">
            {(overview?.bins ?? Array(64).fill(0)).map((value, i) => (
              <button
                key={i}
                aria-label={`查看第 ${i + 1} 段活动，${value} 个事件`}
                title={`${value} 个事件`}
                className={
                  filters.from !== undefined &&
                  overview &&
                  Math.abs(
                    filters.from -
                      (overview.start + ((overview.end - overview.start) * i) / 64),
                  ) < 1
                    ? "active"
                    : ""
                }
                onClick={() => {
                  if (overview)
                    onApply({
                      from:
                        overview.start + ((overview.end - overview.start) * i) / 64,
                      to:
                        overview.start +
                        ((overview.end - overview.start) * (i + 1)) / 64,
                    });
                }}
              >
                <span
                  style={{
                    transform: `scaleY(${Math.max(0.07, Math.log1p(value) / Math.max(1, Math.log1p(Math.max(...(overview?.bins ?? [1])))))})`,
                  }}
                />
              </button>
            ))}
          </div>
          <button className="overview-reset" onClick={onOverview}>
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
            ).map(([view, icon, label]) => (
              <button
                key={view}
                role="tab"
                aria-selected={filters.view === view}
                onClick={() => onView(view)}
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
                filters.view === "events"
                  ? "搜索事件类型 / ID…"
                  : "搜索工具、路径、内容、插件…"
              }
              value={filters.search ?? ""}
              onChange={(e) => onSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="操作类型"
            disabled={filters.view === "events"}
            value={filters.kind ?? ""}
            onChange={(e) => onApply({ kind: e.target.value || undefined })}
          >
            <option value="">所有类型</option>
            {Object.entries(kindLabel).map(([kind, label]) => (
              <option value={kind} key={kind}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="操作状态"
            disabled={filters.view === "events"}
            value={filters.status ?? ""}
            onChange={(e) => onApply({ status: e.target.value || undefined })}
          >
            <option value="">所有状态</option>
            <option value="error">失败</option>
            <option value="running">未观察到结束</option>
            <option value="incomplete">不完整</option>
            <option value="completed">已完成</option>
          </select>
          <button className="filter-clear" onClick={onClear}>
            重置
          </button>
          <button
            aria-label="切换详情面板"
            aria-pressed={inspectorVisible}
            onClick={onToggleInspector}
          >
            ▣
          </button>
          <div className="execution-status-actions">
            {filtered && <span className="filter-indicator">筛选已生效</span>}
            {indexing && <span>正在构建索引…</span>}
            {pending && <button onClick={onPending}>新记录已到达 ↓</button>}
            {live && (
              <label>
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(e) => onFollow(e.target.checked)}
                />
                跟随最新
              </label>
            )}
          </div>
        </div>
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
