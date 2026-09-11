// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { Operation } from "../../analysis/execution-contracts";
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 64,
    getVirtualItems: () =>
      Array.from({ length: Math.min(12, count) }, (_, index) => ({
        index,
        start: index * 64,
      })),
    measureElement() {},
    scrollToIndex() {},
  }),
}));
const session = {
  sessionId: "session-1",
  cwd: "/work/project",
  provider: "openai",
  model: "model",
  eventCount: 42,
  payloadBytes: 2048,
  firstTimestamp: "2026-09-10T00:00:00.000Z",
  lastTimestamp: "2026-09-10T00:01:00.000Z",
  lastTimestampMs: 60000,
  agentRuns: 1,
  turns: 2,
  toolCalls: 3,
  errors: 0,
};
const operation: Operation = {
  id: "op-read",
  sessionId: "session-1",
  runtimeId: "r",
  kind: "tool",
  name: "read",
  summary: "file.ts",
  status: "completed",
  start: 100,
  end: 300,
  startSequence: 1,
  revision: 4,
  eventCount: 2,
  source: "fixture",
  inputEventId: "e1",
  resultEventId: "e2",
  lastEventId: "e2",
  lastEventType: "tool_execution_end",
  incompleteStart: false,
  durationLabel: "观察区间",
};
const page = {
  items: [operation],
  total: 220,
  offset: 0,
  limit: 100,
  revision: 4,
  indexing: false,
  groups: [
    { id: "run-1", name: "Agent 运行", kind: "run" },
    { id: "turn-1", name: "Turn 1", kind: "turn", parentId: "run-1" },
    { id: "turn-2", name: "Turn 2", kind: "turn", parentId: "run-1" },
  ],
  overview: {
    start: 100,
    end: 60000,
    events: 42,
    operations: 220,
    errors: 0,
    gaps: 0,
    bins: Array(64).fill(1),
  },
};
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}
describe("execution workbench AC-002/003/007", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    history.replaceState(null, "", "/");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), "http://localhost");
        const p = url.searchParams;
        if (url.pathname.endsWith("/status"))
          return json({
            recording: true,
            diagnostics: { droppedEvents: 0, storageErrors: 0 },
          });
        if (url.pathname.endsWith("/summary")) return json(session);
        if (url.pathname.endsWith("/sessions"))
          return json({ items: [session] });
        if (url.pathname.endsWith("/execution/page"))
          return json({
            ...page,
            offset: Number(p.get("offset") ?? 0),
            items:
              p.get("view") === "events" || Number(p.get("offset")) > 0
                ? []
                : [operation],
            ...(p.get("view") === "events"
              ? {
                  events: [
                    {
                      id: "e2",
                      type: "tool_execution_end",
                      sequence: 2,
                      timestamp: 300,
                      runtimeId: "r",
                    },
                  ],
                }
              : {}),
          });
        if (url.pathname.endsWith("/execution/inspect"))
          return json({
            operation,
            sections: [
              {
                id: "input",
                label: "输入参数",
                format: "json",
                text: '{"path":"file.ts"}',
                eventId: "e1",
              },
              {
                id: "output",
                label: "工具输出",
                format: "text",
                text: "recorded file content",
                eventId: "e2",
              },
            ],
            events: [],
            totalEvents: 2,
            relations: [],
            warnings: [],
          });
        if (url.pathname.endsWith("/execution/raw"))
          return json({
            eventId: "e2",
            eventType: "tool_execution_end",
            observationStage: "tool_execution_end",
            text: '{"raw":true}',
            offset: 0,
            totalChars: 12,
            masked: true,
          });
        if (url.pathname.endsWith("/execution/step")) return json({ at: 100 });
        throw new Error(`Unexpected request ${url.pathname}`);
      }),
    );
  });
  it("enters three linked views, reads tool evidence, preserves inspector across windows, and resizes by keyboard", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /project.*session-1/i }),
    );
    expect(
      await screen.findByRole("region", { name: "执行时间线" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("公共 hook + 显式埋点 · 跨运行时按观察时间排列"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /read.*file.ts/ }));
    expect(
      await screen.findByText("recorded file content"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "下一窗口 →" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /read.*file.ts/ }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("recorded file content")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("separator"), { key: "ArrowLeft" });
    expect(screen.getByRole("separator")).toHaveAttribute(
      "aria-valuenow",
      "420",
    );
    fireEvent.click(screen.getByRole("tab", { name: /对话/ }));
    await waitFor(() => expect(location.search).toContain("view=conversation"));
    expect(screen.getByText("recorded file content")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /^⌁/ }));
    expect(
      await screen.findByRole("region", { name: "原始事件列表" }),
    ).toBeInTheDocument();
    expect(location.search).not.toContain("token");
  });
  it("keeps replay collapsed until the footer toggle opens it and collapses Agent runs", async () => {
    mount();
    fireEvent.click(
      await screen.findByRole("button", { name: /project.*session-1/i }),
    );
    expect(screen.queryByLabelText("回放时间")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开历史回放" }));
    expect(await screen.findByLabelText("回放时间")).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "收起 Agent 运行" }),
    ).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "收起 Agent 运行" }));
    expect(screen.getByRole("button", { name: "展开 Agent 运行" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: /Turn 1/ })).not.toBeInTheDocument();
  });
  it("opens a deep-linked inspector independently of the first rendered window", async () => {
    history.replaceState(null, "", "/?session=session-1&event=op-read");
    mount();
    expect(
      await screen.findByText("recorded file content"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Raw" }));
    expect(await screen.findByText('{"raw":true}')).toBeInTheDocument();
  });
});
