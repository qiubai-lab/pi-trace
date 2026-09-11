import { request, token } from "./client";
import type {
  ExecutionChange,
  ExecutionFilters,
  ExecutionPage,
  OperationDetail,
  RawSlice,
  ContentSection,
} from "../../analysis/execution-contracts";
function url(route: string, values: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== "") p.set(key, String(value));
  return `/api/v1/execution/${route}?${p}`;
}
export const executionApi = {
  page: (f: ExecutionFilters, signal?: AbortSignal) => {
    const { sessionId, parentId, ...rest } = f;
    return request<ExecutionPage>(
      url("page", { ...rest, session: sessionId, parent: parentId }),
      signal,
    );
  },
  inspect: (
    id: string,
    at?: number,
    reveal = false,
    offset = 0,
    signal?: AbortSignal,
  ) =>
    request<OperationDetail>(
      url("inspect", { id, at, reveal, offset }),
      signal,
    ),
  raw: (
    id: string,
    offset = 0,
    reveal = false,
    at?: number,
    signal?: AbortSignal,
  ) => request<RawSlice>(url("raw", { id, offset, reveal, at }), signal),
  content: (
    id: string,
    section: string,
    offset: number,
    at?: number,
    reveal = false,
    signal?: AbortSignal,
  ) =>
    request<ContentSection>(
      url("content", { id, section, offset, at, reveal }),
      signal,
    ),
  step: (
    session: string,
    at: number,
    direction: "back" | "forward",
    signal?: AbortSignal,
  ) =>
    request<{ at?: number }>(url("step", { session, at, direction }), signal),
};
function retryWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    if (signal.aborted) finish();
  });
}
/** Watermarks resume across reconnects. Re-query only a bounded window, never the whole history. */
export async function executionStream(
  session: string,
  signal: AbortSignal,
  onChange: (change: ExecutionChange) => void,
  onState: (state: string) => void,
): Promise<void> {
  let cursor: string | undefined;
  let delay = 500;
  while (!signal.aborted) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      onState("连接中");
      const res = await fetch(url("stream", { session, cursor }), {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (!res.ok || !res.body) {
        if (res.status === 401) {
          onState("鉴权失败，请重新打开 CLI 链接");
          return;
        }
        throw new Error("stream disconnected");
      }
      onState("已连接");
      delay = 500;
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) throw new Error("stream ended");
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.length > 64_000) throw new Error("stream frame limit");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (frame.includes("event: error")) throw new Error("index error");
          if (frame.includes("event: change")) {
            const data = frame
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (data) {
              const change = JSON.parse(data.slice(6)) as ExecutionChange;
              cursor = change.cursor;
              onChange(change);
            }
          }
        }
      }
    } catch {
      if (!signal.aborted) onState("已断开 · 自动重连");
    } finally {
      await reader?.cancel().catch(() => {});
    }
    if (!signal.aborted) {
      await retryWait(delay, signal);
      delay = Math.min(10_000, delay * 2);
    }
  }
}
