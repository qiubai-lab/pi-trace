import { useQuery } from "@tanstack/react-query";
import { traceApi } from "../api/client";
import { SessionSidebar } from "../features/sessions/SessionSidebar";
import { Workbench } from "../features/execution/Workbench";
import { useWorkspaceState } from "./workspace-state";
export function App() {
  const [workspace, update] = useWorkspaceState();
  const status = useQuery({
    queryKey: ["status"],
    queryFn: ({ signal }) => traceApi.status(signal),
    refetchInterval: 5_000,
  });
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⌁</span>
          <strong>
            Trace<span> / </span>
            <small>PI AGENT</small>
          </strong>
        </div>
        <div className="privacy">
          <span>执行可视化工作台</span>
          <span>仅限本机数据</span>
        </div>
        <div className="recording">
          <span
            className={`status-dot ${status.data?.recording ? "is-on" : ""}`}
          />
          {status.isError
            ? "采集状态不可用"
            : status.isPending
              ? "正在检查…"
              : status.data?.recording
                ? "正在记录"
                : "记录已关闭"}
        </div>
      </header>
      <main className="workspace">
        {workspace.sessionId ? (
          <Workbench
            key={workspace.sessionId}
            workspace={workspace}
            update={update}
            recording={status.data?.recording ?? false}
          />
        ) : (
          <SessionSidebar
            onSelect={(sessionId) => update({ sessionId, eventId: undefined })}
          />
        )}
      </main>
    </div>
  );
}
