import { parentPort, workerData } from "node:worker_threads";
import { existsSync } from "node:fs";
import { ExecutionIndex } from "../storage/execution-index.ts";
import { inspectOperation, maskOperation, mask, rawSlice } from "../analysis/inspection.ts";
let index: ExecutionIndex | undefined;
let lastError: string | undefined;
function sync() {
  if (!existsSync(workerData.database)) return;
  try {
    index ??= new ExecutionIndex(workerData.database);
    index.sync();
    lastError = undefined;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
}
const timer = setInterval(sync, 150);
timer.unref();
parentPort!.on("message", ({ id, method, args }) => {
  try {
    sync();
    if (lastError) throw new Error(lastError);
    let result: unknown;
    if (method === "page") {
      const page = index?.page(args[0]) ?? {
        items: [],
        total: 0,
        offset: 0,
        limit: 100,
        revision: 0,
        indexing: false,
        groups: [],
        overview: {
          start: 0,
          end: 0,
          events: 0,
          operations: 0,
          errors: 0,
          gaps: 0,
          bins: Array(64).fill(0),
        },
      };
      result = { ...page, items: page.items.map(maskOperation), groups: page.groups.map(group => ({ ...group, name: mask(group.name) as string })) };
    } else if (method === "inspect")
      result = index
        ? inspectOperation(
            index,
            ...(args as [string, number?, boolean?, number?]),
          )
        : undefined;
    else if (method === "content")
      result = index
        ? inspectOperation(index, args[0], args[1], args[2], 0, {
            id: args[3],
            offset: args[4],
          })?.sections.find((s) => s.id === args[3])
        : undefined;
    else if (method === "raw") {
      const event = index?.event(args[0]);
      result =
        event && (args[3] === undefined || event.timestampMs <= args[3])
          ? rawSlice(event, args[1], args[2])
          : undefined;
    } else if (method === "step")
      result = index?.step(args[0], args[1], args[2]);
    else if (method === "cursor")
      result = {
        revision: index?.committedRevision(args[0]) ?? 0,
        epoch: index?.epoch ?? "empty",
        indexing: index?.indexing ?? false,
      };
    else throw new Error("unknown execution query");
    parentPort!.postMessage({ id, result });
  } catch (error) {
    parentPort!.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
