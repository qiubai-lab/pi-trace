import { useCallback, useEffect, useState } from "react";

export interface WorkspaceState { sessionId?: string; eventId?: string }

function readState(): WorkspaceState {
  const params = new URLSearchParams(location.search);
  return {
    sessionId: params.get("session") ?? undefined,
    eventId: params.get("event") ?? undefined,
  };
}

export function useWorkspaceState(): [WorkspaceState, (patch: Partial<WorkspaceState>) => void] {
  const [state, setState] = useState(readState);
  useEffect(() => {
    const onPop = () => setState(readState());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const update = useCallback((patch: Partial<WorkspaceState>) => {
    setState(current => {
      const next = { ...current, ...patch };
      const params = new URLSearchParams();
      if (next.sessionId) params.set("session", next.sessionId);
      if (next.eventId) params.set("event", next.eventId);
      history.pushState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
      return next;
    });
  }, []);
  return [state, update];
}
