import type { IncomingMessage, ServerResponse } from "node:http";
import type { ExecutionService } from "../execution-service.ts";
import type { ExecutionFilters } from "../analysis/execution-contracts.ts";
import { securityHeaders, send } from "./http.ts";
import type { ActiveStream } from "./routes.ts";
function number(
  params: URLSearchParams,
  key: string,
  fallback?: number,
): number | undefined {
  const value = params.get(key);
  if (value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`${key} must be a non-negative number`);
  return n;
}
export async function handleExecutionRoute(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  service: ExecutionService,
  streams: Set<ActiveStream>,
): Promise<boolean> {
  const p = url.searchParams;
  const sessionId = p.get("session") ?? "";
  if (!url.pathname.startsWith("/api/v1/execution/")) return false;
  const route = url.pathname.slice("/api/v1/execution/".length);
  if (route === "page") {
    if (!sessionId) throw new Error("session must be provided");
    const view = p.get("view") ?? "execution";
    if (!["execution", "conversation", "events"].includes(view))
      throw new Error("view must be execution, conversation or events");
    const limit = number(p, "limit", 100)!;
    const offset = number(p, "offset", 0)!;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 200 ||
      !Number.isInteger(offset)
    )
      throw new Error("limit/offset must be bounded integers");
    if ((p.get("search")?.length ?? 0) > 500)
      throw new Error("search must be at most 500 characters");
    send(
      res,
      200,
      await service.page({
        sessionId,
        view: view as ExecutionFilters["view"],
        search: p.get("search") ?? undefined,
        kind: p.get("kind") ?? undefined,
        status: p.get("status") ?? undefined,
        parentId: p.get("parent") ?? undefined,
        focus: p.get("focus") ?? undefined,
        from: number(p, "from"),
        to: number(p, "to"),
        at: number(p, "at"),
        offset,
        limit,
      }),
    );
  } else if (route === "inspect" || route === "raw" || route === "content") {
    const id = p.get("id");
    if (!id || id.length > 2000)
      throw new Error("id must be provided and bounded");
    const offset = number(p, "offset", 0)!;
    if (!Number.isInteger(offset)) throw new Error("offset must be an integer");
    const data =
      route === "content"
        ? await service.content(
            id,
            number(p, "at"),
            p.get("reveal") === "true",
            p.get("section") ?? "",
            offset,
          )
        : route === "inspect"
          ? await service.inspect(
              id,
              number(p, "at"),
              p.get("reveal") === "true",
              offset,
            )
          : await service.raw(
              id,
              offset,
              p.get("reveal") === "true",
              number(p, "at"),
            );
    data
      ? send(res, 200, data)
      : send(res, 404, { error: "此时刻无可用记录，或记录已清理" });
  } else if (route === "step") {
    send(res, 200, {
      at: await service.step(
        sessionId,
        number(p, "at", 0)!,
        p.get("direction") === "back" ? -1 : 1,
      ),
    });
  } else if (route === "stream") {
    res.writeHead(200, {
      ...securityHeaders("text/event-stream; charset=utf-8"),
      Connection: "keep-alive",
    });
    let cursor = p.get("cursor") ?? "";
    let busy = false;
    const poll = async () => {
      if (busy || res.destroyed) return;
      busy = true;
      try {
        const state = await service.cursor(sessionId);
        const next = `${state.epoch}:${state.revision}`;
        if (res.destroyed) return;
        if (next !== cursor) {
          const reset = Boolean(
            cursor && !cursor.startsWith(`${state.epoch}:`),
          );
          // Invalidation watermark, not event delivery: clients re-query their bounded window.
          if (
            !res.write(
              `id: ${next}\nevent: change\ndata: ${JSON.stringify({ cursor: next, revision: state.revision, reset })}\n\n`,
            )
          ) {
            res.end();
          }
          cursor = next;
        } else res.write(": heartbeat\n\n");
      } catch {
        if (!res.destroyed) {
          res.write("event: error\ndata: {}\n\n");
          res.end();
        }
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => {
      void poll();
    }, 750);
    timer.unref();
    const stream = { timer, response: res };
    streams.add(stream);
    req.once("close", () => {
      clearInterval(timer);
      streams.delete(stream);
    });
    await poll();
  } else send(res, 404, { error: "unknown execution route" });
  return true;
}
