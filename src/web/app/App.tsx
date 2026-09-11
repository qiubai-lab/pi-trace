import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { streamEvents, traceApi } from "../api/client";
import { Conversation } from "../features/conversation/Conversation";
import { SessionContextBar } from "../features/session-overview/SessionOverview";
import { SessionSidebar } from "../features/sessions/SessionSidebar";
import { useWorkspaceState } from "./workspace-state";

export function App() {
  const [workspace, update] = useWorkspaceState();
  const [live, setLive] = useState(false);
  const [liveState, setLiveState] = useState<"off" | "connecting" | "live" | "error">("off");
  const client = useQueryClient();
  const status = useQuery({ queryKey: ["status"], queryFn: ({ signal }) => traceApi.status(signal), refetchInterval: 5_000 });

  useEffect(() => {
    if (!workspace.sessionId || !live) { setLiveState("off"); return; }
    const controller = new AbortController();
    setLiveState("connecting");
    streamEvents(workspace.sessionId, controller.signal, () => {
      setLiveState("live");
      void client.invalidateQueries({ queryKey: ["conversation", workspace.sessionId] });
      void client.invalidateQueries({ queryKey: ["session-summary", workspace.sessionId] });
    }).catch(() => { if (!controller.signal.aborted) setLiveState("error"); });
    return () => controller.abort();
  }, [workspace.sessionId, live, client]);

  const selectSession = (sessionId: string) => { setLive(false); update({ sessionId, eventId: undefined }); };
  const leaveSession = () => { setLive(false); update({ sessionId: undefined, eventId: undefined }); };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">QB</span><span>Trace</span></div>
      <div className="privacy"><span>仅限本机数据</span><span>Payload 未经脱敏</span></div>
      <div className={`recording ${status.data?.recording ? "is-on" : ""}`}><span className="status-dot" />{status.isPending ? "正在检查…" : status.data?.recording ? "正在记录" : "记录已关闭"}</div>
    </header>
    <main className="workspace">
      {!workspace.sessionId
        ? <SessionSidebar onSelect={selectSession} />
        : <section className="analysis-pane">
          <div className="canvas-navigation"><button className="back-button" onClick={leaveSession}><span aria-hidden="true">←</span> 返回 Session</button><span>Session 画布</span></div>
          <SessionContextBar sessionId={workspace.sessionId} live={live} liveState={liveState} onToggleLive={() => setLive(value => !value)} />
          <div className="canvas-body"><AnalysisContent workspace={workspace} update={update} /></div>
        </section>}
    </main>
  </div>;
}

function AnalysisContent({ workspace, update }: { workspace: ReturnType<typeof useWorkspaceState>[0]; update: ReturnType<typeof useWorkspaceState>[1] }) {
  return <div className="analysis-content"><Conversation sessionId={workspace.sessionId!} selected={workspace.eventId} onSelect={eventId => update({ eventId })} /></div>;
}
