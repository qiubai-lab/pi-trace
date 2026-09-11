import type { ConversationItem, CursorPage, EventDetail, SessionSummary, Status } from "../types";

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

const token = bootstrapToken();

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try { message = (await response.json() as { error?: string }).error ?? message; } catch { /* use status */ }
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
  sessions: (cursor?: string, signal?: AbortSignal) => request<CursorPage<SessionSummary>>(pagePath("/api/v1/sessions", cursor), signal),
  sessionSummary: (sessionId: string, signal?: AbortSignal) => request<SessionSummary>(`/api/v1/sessions/${encodeURIComponent(sessionId)}/summary`, signal),
  conversation: (sessionId: string, cursor?: string, signal?: AbortSignal) => request<CursorPage<ConversationItem>>(pagePath(`/api/v1/sessions/${encodeURIComponent(sessionId)}/conversation`, cursor), signal),
  event: (eventId: string, signal?: AbortSignal) => request<EventDetail>(`/api/v1/events/${encodeURIComponent(eventId)}`, signal),
};

export async function streamEvents(sessionId: string, signal: AbortSignal, onEvents: () => void): Promise<void> {
  const params = new URLSearchParams({ sessionId });
  const response = await fetch(`/api/v1/events/stream?${params}`, {
    headers: { Authorization: `Bearer ${token}` }, signal, cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error((await response.text()) || `HTTP ${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      if (block.includes("event: events")) onEvents();
      if (block.includes("event: error")) throw new Error("Live stream reported a query error");
    }
  }
}
