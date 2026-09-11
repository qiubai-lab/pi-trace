import type { RuntimeDiagnosticsStore } from "./diagnostics.ts";
import type { TraceEnvelope } from "./events.ts";
import type { TraceStoreWriter } from "./store.ts";

export interface TraceCollectorOptions {
  writer: () => TraceStoreWriter;
  diagnostics: RuntimeDiagnosticsStore;
  enabled?: boolean;
  maxQueueEvents?: number;
  maxQueueBytes?: number;
  batchSize?: number;
  flushIntervalMs?: number;
  maxAttempts?: number;
}

export class TraceCollector {
  private readonly queue: TraceEnvelope[] = [];
  private queueBytes = 0;
  private writer?: TraceStoreWriter;
  private timer?: NodeJS.Timeout;
  private flushing = false;
  private consecutiveFailures = 0;
  private enabled: boolean;
  private readonly maxQueueEvents: number;
  private readonly maxQueueBytes: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private writeBatches = 0;
  private writeMs = 0;
  private maxWriteMs = 0;

  constructor(private readonly options: TraceCollectorOptions) {
    this.enabled = options.enabled ?? true;
    this.maxQueueEvents = options.maxQueueEvents ?? 2_000;
    this.maxQueueBytes = options.maxQueueBytes ?? 64 * 1024 * 1024;
    this.batchSize = options.batchSize ?? 100;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.timer = setInterval(() => { void this.flush(); }, options.flushIntervalMs ?? 100);
    this.timer.unref();
  }

  isEnabled(): boolean { return this.enabled; }
  pendingEvents(): number { return this.queue.length; }
  metrics() { return { pendingEvents: this.queue.length, pendingBytes: this.queueBytes, writeBatches: this.writeBatches, writeMs: this.writeMs, maxWriteMs: this.maxWriteMs }; }

  enqueue(event: TraceEnvelope): boolean {
    if (!this.enabled) return false;
    const bytes = event.payloadBytes + 512;
    if (bytes > this.maxQueueBytes || this.queue.length >= this.maxQueueEvents || this.queueBytes + bytes > this.maxQueueBytes) {
      this.options.diagnostics.recordDrop(1, new Error("trace queue capacity exceeded; whole event dropped"));
      return false;
    }
    this.queue.push(event);
    this.queueBytes += bytes;
    return true;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (!enabled) await this.drain(1_800);
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;
    const batch = this.queue.slice(0, this.batchSize);
    try {
      this.writer ??= this.options.writer();
      const started = performance.now();
      await this.writer.append(batch);
      const elapsed = performance.now() - started;
      this.writeBatches++; this.writeMs += elapsed; this.maxWriteMs = Math.max(this.maxWriteMs, elapsed);
      this.remove(batch.length);
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures++;
      this.options.diagnostics.recordError(error);
      if (this.consecutiveFailures >= this.maxAttempts) {
        this.remove(batch.length);
        this.options.diagnostics.recordDrop(batch.length, error);
        this.consecutiveFailures = 0;
      }
      try { await this.writer?.close(); } catch { /* fail open */ }
      this.writer = undefined;
    } finally {
      this.flushing = false;
    }
  }

  async stop(timeoutMs = 1_800): Promise<void> {
    this.enabled = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.drain(timeoutMs);
    if (this.queue.length > 0) {
      const remaining = this.queue.length;
      this.remove(remaining);
      this.options.diagnostics.recordDrop(remaining, new Error("trace shutdown flush deadline exceeded"));
    }
    try { await this.writer?.close(); } catch (error) { this.options.diagnostics.recordError(error); }
    this.writer = undefined;
  }

  private async drain(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (this.queue.length > 0 && Date.now() <= deadline) {
      await this.flush();
      if (this.queue.length > 0) await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  private remove(count: number): void {
    for (const event of this.queue.splice(0, count)) this.queueBytes -= event.payloadBytes + 512;
    if (this.queueBytes < 0) this.queueBytes = 0;
  }
}
