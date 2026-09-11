import { Worker } from "node:worker_threads";
/** Request/response worker with bounded pending work, deadlines and deterministic teardown. */
export class WorkerClient {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve(value: any): void;
      reject(error: Error): void;
      timer: NodeJS.Timeout;
    }
  >();
  private closed = false;
  constructor(url: URL, workerData?: unknown) {
    this.worker = new Worker(url, { workerData, execArgv: ["--no-warnings"] });
    this.worker.on("message", ({ id, result, error }) => {
      const item = this.pending.get(id);
      if (!item) return;
      clearTimeout(item.timer);
      this.pending.delete(id);
      error ? item.reject(new Error(error)) : item.resolve(result);
    });
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", (code) => {
      if (!this.closed) this.fail(new Error(`trace worker exited (${code})`));
    });
    this.worker.unref();
  }
  call<T>(method: string, args: unknown[] = [], timeout = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error("trace worker closed"));
    if (this.pending.size >= 128)
      return Promise.reject(new Error("trace worker queue limit reached"));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`trace worker ${method} deadline exceeded`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, method, args });
    });
  }
  private fail(error: Error): void {
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
  async close(): Promise<void> {
    this.fail(new Error("trace worker closed"));
    await this.worker.terminate();
  }
}
