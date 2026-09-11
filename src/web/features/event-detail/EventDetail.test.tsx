// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { traceApi } from "../../api/client";
import { EventDetail } from "./EventDetail";

vi.mock("../../api/client", () => ({ traceApi: { event: vi.fn() } }));
const event = {
  eventId: "event-1", eventType: "message_end", timestamp: "2026-09-10T00:00:00.000Z", timestampMs: 1,
  runtimeId: "runtime", sessionId: "session", sequence: 1, payloadBytes: 8, isError: false,
  observationStage: "message_end", monotonicNs: "1", payloadJson: "{broken",
};
function renderDetail(eventId?: string, variant: "pane" | "popover" = "pane", onClose = () => {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><EventDetail eventId={eventId} variant={variant} onClose={onClose} /></QueryClientProvider>);
}

describe("lazy Event detail", () => {
  beforeEach(() => vi.mocked(traceApi.event).mockReset());
  afterEach(cleanup);
  it("does not request a payload until an Event is selected", () => {
    renderDetail();
    expect(traceApi.event).not.toHaveBeenCalled();
    expect(screen.getByText("选择一个事件")).toBeInTheDocument();
  });
  it("keeps malformed stored text available in structured and raw modes", async () => {
    vi.mocked(traceApi.event).mockResolvedValue(event);
    renderDetail("event-1");
    expect(await screen.findByText("{broken")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "原始内容" }));
    expect(screen.getByText("{broken")).toBeInTheDocument();
  });
  it("renders loading state and close control inside the popover surface", async () => {
    vi.mocked(traceApi.event).mockResolvedValue(event);
    const onClose = vi.fn();
    renderDetail("event-1", "popover", onClose);
    expect(screen.getByRole("dialog", { name: "事件详情" })).toBeInTheDocument();
    expect(screen.getByText("正在载入 Payload…")).toBeInTheDocument();
    expect(await screen.findByText("{broken")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭事件详情" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("retains access to a large stored payload", async () => {
    const payloadJson = JSON.stringify({ text: "x".repeat(100_000) });
    vi.mocked(traceApi.event).mockResolvedValue({ ...event, payloadBytes: payloadJson.length, payloadJson });
    const rendered = renderDetail("event-1");
    fireEvent.click(await screen.findByRole("button", { name: "原始内容" }));
    expect(rendered.container.querySelector(".payload")?.textContent).toBe(payloadJson);
  });
});
