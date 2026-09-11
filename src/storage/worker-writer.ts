import type { TraceEnvelope } from "../events.ts";
import type { TraceStoreWriter } from "../store.ts";
import { WorkerClient } from "../workers/client.ts";
export class WorkerTraceWriter implements TraceStoreWriter {
  private client: WorkerClient;
  constructor(database: string) {
    this.client = new WorkerClient(
      new URL("../../dist/workers/writer.mjs", import.meta.url),
      { database },
    );
  }
  append(events: readonly TraceEnvelope[]): Promise<void> {
    return this.client.call("append", [events], 800);
  }
  async close(): Promise<void> {
    await this.client.close();
  }
}
