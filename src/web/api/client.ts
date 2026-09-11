import type { CursorPage, SessionSummary, Status } from "../types";
const TOKEN_KEY = "qb-trace-token";
export function bootstrapToken(): string {
  const hash = new URLSearchParams(location.hash.slice(1));
  const incoming = hash.get("token");
  if (incoming) {
    sessionStorage.setItem(TOKEN_KEY, incoming);
    history.replaceState(null, "", `${location.pathname}${location.search}`);
  }
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}
export const token = bootstrapToken();
export async function request<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      message =
        ((await response.json()) as { error?: string }).error ?? message;
    } catch {
      /* use status */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
function pagePath(base: string, cursor?: string): string {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursor", cursor);
  return `${base}?${params}`;
}
export const traceApi = {
  status: (signal?: AbortSignal) => request<Status>("/api/v1/status", signal),
  sessions: (cursor?: string, signal?: AbortSignal) =>
    request<CursorPage<SessionSummary>>(
      pagePath("/api/v1/sessions", cursor),
      signal,
    ),
  sessionSummary: (sessionId: string, signal?: AbortSignal) =>
    request<SessionSummary>(
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/summary`,
      signal,
    ),
};
