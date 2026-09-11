import { useCallback, useEffect, useState } from "react";
export interface WorkspaceState {
  sessionId?: string;
  eventId?: string;
  view?: "execution" | "conversation" | "events";
  search?: string;
  kind?: string;
  status?: string;
  parent?: string;
  from?: number;
  to?: number;
  at?: number;
}
function readState(): WorkspaceState {
  const p = new URLSearchParams(location.search);
  const numeric = (key: string) =>
    p.has(key) && Number.isFinite(Number(p.get(key))) && Number(p.get(key)) >= 0
      ? Number(p.get(key))
      : undefined;
  const view = p.get("view");
  return {
    sessionId: p.get("session") ?? undefined,
    eventId: p.get("event") ?? undefined,
    ...(view === "conversation" || view === "events" ? { view } : {}),
    ...Object.fromEntries(
      ["search", "kind", "status", "parent"]
        .filter((k) => p.has(k))
        .map((k) => [k, p.get(k)]),
    ),
    ...Object.fromEntries(
      ["from", "to", "at"]
        .filter((k) => numeric(k) !== undefined)
        .map((k) => [k, numeric(k)]),
    ),
  };
}
export function useWorkspaceState(): [
  WorkspaceState,
  (patch: Partial<WorkspaceState>, replace?: boolean) => void,
] {
  const [state, setState] = useState(readState);
  useEffect(() => {
    const pop = () => setState(readState());
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);
  const update = useCallback(
    (patch: Partial<WorkspaceState>, replace = false) => {
      setState((current) => {
        const next = { ...current, ...patch };
        const params = new URLSearchParams();
        if (next.sessionId) params.set("session", next.sessionId);
        if (next.eventId) params.set("event", next.eventId);
        for (const key of [
          "view",
          "search",
          "kind",
          "status",
          "parent",
          "from",
          "to",
          "at",
        ] as const)
          if (
            next[key] !== undefined &&
            next[key] !== "" &&
            !(key === "view" && next[key] === "execution")
          )
            params.set(key, String(next[key]));
        history[replace ? "replaceState" : "pushState"](
          null,
          "",
          `${location.pathname}${params.size ? `?${params}` : ""}`,
        );
        return next;
      });
    },
    [],
  );
  return [state, update];
}
