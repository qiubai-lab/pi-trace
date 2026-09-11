// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { traceApi } from "../../api/client";
import { Conversation } from "./Conversation";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 140,
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({ index, start: index * 140 })),
    measureElement: () => undefined,
  }),
}));

describe("Conversation", () => {
  it("merges one tool invocation across pages into one source-linked block", async () => {
    vi.spyOn(traceApi, "conversation").mockImplementation(async (_session, cursor) => cursor ? {
      items: [{
        itemId: "tool:call", eventId: "result-event", eventType: "tool_result", timestamp: "2026-09-10T00:00:01Z", timestampMs: 2,
        role: "tool", title: "read", preview: "Result\nfile body", truncated: false, isError: false, toolCallId: "call",
        toolName: "read", toolStatus: "completed", toolResultPreview: "file body",
      }], nextCursor: undefined,
    } : {
      items: [{
        itemId: "tool:call", eventId: "call-event", eventType: "tool_execution_start", timestamp: "2026-09-10T00:00:00Z", timestampMs: 1,
        role: "tool", title: "read", preview: "Input\nsrc/app.ts", truncated: false, isError: false, toolCallId: "call",
        toolName: "read", toolStatus: "pending", toolInputPreview: "src/app.ts",
      }], nextCursor: "next",
    });
    vi.spyOn(traceApi, "event").mockResolvedValue({
      eventId: "result-event", eventType: "tool_result", timestamp: "2026-09-10T00:00:01Z", timestampMs: 2,
      runtimeId: "runtime", sessionId: "session", sequence: 2, payloadBytes: 16, isError: false,
      observationStage: "tool_result", monotonicNs: "2", toolCallId: "call", payloadJson: "{\"result\":\"file body\"}",
    });
    const selected: string[] = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Harness() {
      const [eventId, setEventId] = useState<string>();
      return <Conversation sessionId="session" selected={eventId} onSelect={id => { setEventId(id); if (id) selected.push(id); }} />;
    }
    const { container } = render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>);

    expect(await screen.findByText("等待中")).toBeInTheDocument();
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(container.querySelectorAll(".conversation-card")).toHaveLength(1);
    const canvas = screen.getByLabelText("对话画布");
    Object.defineProperties(canvas, { scrollTop: { value: 200, writable: true }, scrollHeight: { value: 640, configurable: true }, clientHeight: { value: 320, configurable: true } });
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientY: 70 });
    expect(canvas.scrollTop).toBe(230);
    fireEvent.pointerUp(canvas, { pointerId: 1, clientY: 70 });
    fireEvent.scroll(canvas);
    expect(await screen.findByText("已完成")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续载入后续上下文" })).not.toBeInTheDocument();
    expect(screen.getByText("file body")).toBeInTheDocument();
    expect(container.querySelectorAll(".conversation-card")).toHaveLength(1);
    fireEvent.click(screen.getByText("file body"));
    await waitFor(() => expect(selected).toEqual(["result-event"]));
    expect(await screen.findByRole("dialog", { name: "事件详情" })).toBeInTheDocument();
    expect(location.search).not.toContain("token");
    await waitFor(() => expect(screen.getByRole("button", { name: "关闭事件详情" })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "事件详情" })).not.toBeInTheDocument());
    const source = screen.getByRole("button", { name: /read.*已完成/i });
    await waitFor(() => expect(source).toHaveFocus());
    fireEvent.click(source);
    expect(await screen.findByRole("dialog", { name: "事件详情" })).toBeInTheDocument();
    fireEvent.pointerDown(document.querySelector(".event-modal-backdrop")!);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "事件详情" })).not.toBeInTheDocument());
  });
});
