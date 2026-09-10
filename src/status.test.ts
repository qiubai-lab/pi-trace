import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TraceStatusController } from "./status.ts";

afterEach(() => {
  vi.useRealTimers();
});

describe("trace footer status", () => {
  it("renders recording state and periodically refreshes global storage statistics", async () => {
    vi.useFakeTimers();
    const setStatus = vi.fn();
    let stats = { eventCount: 12, sizeBytes: 1_500_000 };
    const readStats = vi.fn(async () => stats);
    const ctx = {
      mode: "tui",
      ui: {
        setStatus,
        theme: { fg: (_color: string, text: string) => text },
      },
    } as unknown as ExtensionContext;
    const status = new TraceStatusController(ctx, readStats, 5_000);

    await status.start(true);
    expect(setStatus).toHaveBeenLastCalledWith("qb-trace", "● trace on · 12 events · 1.5 MB");

    stats = { eventCount: 15, sizeBytes: 2_000_000 };
    await vi.advanceTimersByTimeAsync(5_000);
    expect(setStatus).toHaveBeenLastCalledWith("qb-trace", "● trace on · 15 events · 2.0 MB");

    status.setEnabled(false);
    expect(setStatus).toHaveBeenLastCalledWith("qb-trace", "○ trace off · 15 events · 2.0 MB");
    status.stop();
    expect(setStatus).toHaveBeenLastCalledWith("qb-trace", undefined);
  });

  it("retains the last statistics and does not affect status control when refresh fails", async () => {
    vi.useFakeTimers();
    const setStatus = vi.fn();
    const readStats = vi.fn()
      .mockResolvedValueOnce({ eventCount: 3, sizeBytes: 900 })
      .mockRejectedValueOnce(new Error("database unavailable"));
    const ctx = {
      mode: "tui",
      ui: {
        setStatus,
        theme: { fg: (_color: string, text: string) => text },
      },
    } as unknown as ExtensionContext;
    const status = new TraceStatusController(ctx, readStats, 5_000);

    await status.start(true);
    expect(setStatus).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(setStatus).toHaveBeenCalledTimes(1);
    status.setEnabled(false);

    expect(setStatus).toHaveBeenLastCalledWith("qb-trace", "○ trace off · 3 events · 900 B");
    status.stop();
  });
});
