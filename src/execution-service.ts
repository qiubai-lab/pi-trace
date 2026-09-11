import { WorkerClient } from "./workers/client.ts";
import type {
  ExecutionFilters,
  ExecutionPage,
  OperationDetail,
  RawSlice,
  ContentSection,
} from "./analysis/execution-contracts.ts";
export class ExecutionService {
  private client: WorkerClient;
  constructor(database: string) {
    this.client = new WorkerClient(
      new URL("../dist/workers/execution.mjs", import.meta.url),
      { database },
    );
  }
  page(filters: ExecutionFilters): Promise<ExecutionPage> {
    return this.client.call("page", [filters]);
  }
  inspect(
    id: string,
    at?: number,
    reveal = false,
    offset = 0,
  ): Promise<OperationDetail | undefined> {
    return this.client.call("inspect", [id, at, reveal, offset]);
  }
  raw(
    id: string,
    offset = 0,
    reveal = false,
    at?: number,
  ): Promise<RawSlice | undefined> {
    return this.client.call("raw", [id, offset, reveal, at]);
  }
  content(
    id: string,
    at: number | undefined,
    reveal: boolean,
    section: string,
    offset: number,
  ): Promise<ContentSection | undefined> {
    return this.client.call("content", [id, at, reveal, section, offset]);
  }
  step(
    session: string,
    at: number,
    direction: number,
  ): Promise<number | undefined> {
    return this.client.call("step", [session, at, direction]);
  }
  cursor(session?: string): Promise<{ revision: number; epoch: string; indexing: boolean }> {
    return this.client.call("cursor", [session]);
  }
  close(): Promise<void> {
    return this.client.close();
  }
}
