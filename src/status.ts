import { existsSync } from "node:fs";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { TraceQueryService } from "./query.ts";
import { traceDatabaseSize } from "./store.ts";

export const TRACE_STATUS_KEY = "qb-trace";

export interface TraceStorageStats {
  eventCount: number;
  sizeBytes: number;
}

export type TraceStorageStatsReader = () => Promise<TraceStorageStats>;

export function formatStorageSize(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(1)} kB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

export function createTraceStorageStatsReader(databasePath: string): TraceStorageStatsReader {
  return async () => {
    if (!existsSync(databasePath)) return { eventCount: 0, sizeBytes: 0 };
    const query = new TraceQueryService(databasePath);
    try {
      return { eventCount: query.countEvents(), sizeBytes: traceDatabaseSize(databasePath) };
    } finally {
      query.close();
    }
  };
}

export class TraceStatusController {
  private enabled = false;
  private stats?: TraceStorageStats;
  private timer?: NodeJS.Timeout;
  private refreshing = false;
  private stopped = false;
  private lastState?: string;

  constructor(
    private readonly ctx: ExtensionContext,
    private readonly readStats: TraceStorageStatsReader,
    private readonly intervalMs = 5_000,
  ) {}

  async start(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.stopped = false;
    await this.refresh();
    this.render();
    this.timer = setInterval(() => { void this.refresh(); }, this.intervalMs);
    this.timer.unref();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.render();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    try { this.ctx.ui.setStatus(TRACE_STATUS_KEY, undefined); } catch { /* display-only */ }
  }

  private async refresh(): Promise<void> {
    if (this.refreshing || this.stopped) return;
    this.refreshing = true;
    try {
      const stats = await this.readStats();
      if (this.stopped) return;
      this.stats = stats;
      this.render();
    } catch {
      // Storage statistics are display-only and must never affect collection.
    } finally {
      this.refreshing = false;
    }
  }

  private render(): void {
    if (this.stopped) return;
    const state = `${this.enabled}:${this.stats?.eventCount ?? "?"}:${this.stats?.sizeBytes ?? "?"}`;
    if (state === this.lastState) return;
    try {
      const theme = this.ctx.ui.theme;
      const icon = theme.fg(this.enabled ? "success" : "dim", this.enabled ? "●" : "○");
      const mode = theme.fg("dim", ` trace ${this.enabled ? "on" : "off"}`);
      const count = this.stats ? this.stats.eventCount.toLocaleString("en-US") : "?";
      const size = this.stats ? formatStorageSize(this.stats.sizeBytes) : "?";
      const storage = theme.fg("dim", ` · ${count} events · ${size}`);
      this.ctx.ui.setStatus(TRACE_STATUS_KEY, icon + mode + storage);
      this.lastState = state;
    } catch {
      // Terminal rendering failures must not affect tracing.
    }
  }
}
