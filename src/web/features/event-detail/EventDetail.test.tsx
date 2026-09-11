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
    fireEvent.click(screen.getByRole("tab", { name: "原始 Payload" }));
    expect(screen.getByText("{broken")).toBeInTheDocument();
  });
  it("renders semantic message and tool detail views while retaining raw Payload", async () => {
    vi.mocked(traceApi.event).mockResolvedValue({ ...event, payloadJson: JSON.stringify({ message: { role: "user", content: [{ text: "请读取项目中的 README" }] } }) });
    renderDetail("event-1");
    expect((await screen.findAllByText("用户输入")).length).toBeGreaterThan(0);
    expect(screen.getByText("请读取项目中的 README")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "原始 Payload" }));
    expect(screen.getByText(/"role":\s*"user"/)).toBeInTheDocument();
    cleanup();

    vi.mocked(traceApi.event).mockResolvedValue({ ...event, eventType: "tool_result", isError: false, payloadJson: JSON.stringify({ toolName: "read", content: [{ text: "README 内容" }] }) });
    renderDetail("event-1");
    expect(await screen.findByRole("group", { name: "调用结果显示方式" })).toBeInTheDocument();
    expect(screen.getByText("read")).toBeInTheDocument();
    expect(screen.getByText("已完成")).toBeInTheDocument();
    expect(screen.getByText("README 内容")).toBeInTheDocument();
  });
  it("switches between top-level tabs and readable-content modes", async () => {
    vi.mocked(traceApi.event).mockResolvedValue({ ...event, payloadJson: JSON.stringify({ message: { role: "user", content: [{ text: "# 标题\n\n- 项目" }] } }) });
    renderDetail("event-1");
    expect(await screen.findByRole("heading", { name: "标题" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "文本原文" }));
    expect(screen.getByRole("button", { name: "Markdown 渲染" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("tab", { name: "事件信息" }));
    expect(screen.getByRole("heading", { name: "事件信息" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "原始 Payload" }));
    expect(screen.getByText((_, element) => Boolean(element?.classList.contains("raw-payload") && element.textContent?.includes("\n  \"message\":")))).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("tab", { name: "原始 Payload" }));
    expect(rendered.container.querySelector(".raw-payload")?.textContent).toBe(JSON.stringify(JSON.parse(payloadJson), null, 2));
  });
});
