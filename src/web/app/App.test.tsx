// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const session = {
  sessionId: "session-1", cwd: "/work/project", provider: "openai", model: "model",
  eventCount: 42, payloadBytes: 2048, firstTimestamp: "2026-09-10T00:00:00.000Z",
  lastTimestamp: "2026-09-10T00:01:00.000Z", lastTimestampMs: 60_000,
  agentRuns: 1, turns: 2, toolCalls: 3, errors: 0,
};

function json(body: unknown): Response { return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }); }

describe("Session workbench", () => {
  beforeEach(() => {
    history.replaceState(null, "", "/");
    class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
    vi.stubGlobal("ResizeObserver", ResizeObserver);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.includes("/api/v1/status")) return json({ recording: true, schemaVersion: 1, databaseSizeBytes: 1, overview: { eventCount: 42, payloadBytes: 2048 }, diagnostics: { droppedEvents: 0, storageErrors: 0 } });
      if (path.includes("/api/v1/sessions/session-1/summary")) return json(session);
      if (path.includes("/api/v1/sessions/session-1/timeline")) return json({ items: [], nextCursor: undefined });
      if (path.includes("/api/v1/sessions/session-1/conversation")) return json({ items: [], nextCursor: undefined });
      if (path.includes("/api/v1/sessions")) return json({ items: [session], nextCursor: undefined });
      throw new Error(`Unexpected request: ${path}`);
    }));
  });

  it("starts with an informative Session list, enters its canvas, and returns", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
    expect(screen.getByRole("heading", { name: "Session" })).toBeInTheDocument();
    expect(await screen.findByText("#session-1")).toBeInTheDocument();
    expect(screen.getByText("1 次运行 · 2 轮 · 3 个工具")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /project.*session-1/i }));
    expect(await screen.findByRole("button", { name: "返回 Session" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Session 上下文")).toHaveTextContent("/work/project");
    expect(screen.getByLabelText("Session 上下文")).toHaveTextContent("42");
    expect(screen.getByRole("button", { name: "开启实时" })).toBeInTheDocument();
    expect(screen.queryByText("按时间顺序查看 Session")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Session" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Timeline" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "原始内容" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by event type")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("事件详情")).not.toBeInTheDocument();
    expect(location.search).toBe("?session=session-1");
    expect(await screen.findByText("没有可用的对话上下文")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回 Session" }));
    await waitFor(() => expect(location.search).not.toContain("session="));
    expect(screen.getByRole("heading", { name: "Session" })).toBeInTheDocument();
    expect(screen.getByText("Payload 未经脱敏")).toBeInTheDocument();
  });
});
