import { parentPort, workerData } from "node:worker_threads";
import { TraceStore } from "../store.ts";
const store = new TraceStore(workerData.database);
parentPort!.on("message", ({ id, method, args }) => {
  try {
    if (method === "append") store.append(args[0]);
    else if (method === "close") store.close();
    else throw new Error("unknown writer operation");
    parentPort!.postMessage({ id, result: null });
  } catch (error) {
    parentPort!.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
