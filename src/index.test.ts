import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "./cli.ts";
import { RecordingConfigStore } from "./config.ts";
import { TraceStore } from "./store.ts";
import { registerQbTrace } from "./index.ts";

type Handler = (event: any, ctx: ExtensionContext) => unknown;
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));

describe("Pi trace adapter", () => {
  it("does not require or render footer status outside TUI mode", async () => {
    const home = await mkdtemp(join(tmpdir(), "qb-trace-json-")); roots.push(home);
    const handlers = new Map<string, Handler>();
    const pi = { on: (name: string, handler: Handler) => { handlers.set(name, handler); } } as unknown as ExtensionAPI;
    registerQbTrace(pi, { env: { QB_TRACE_HOME: home }, enabledOverride: false });
    const ctx = {
      cwd: "/project", mode: "json", thinkingLevel: "off",
      sessionManager: { getSessionId: () => "json-session", getSessionFile: () => undefined },
    } as unknown as ExtensionContext;

    await expect(handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx)).resolves.toBeUndefined();
    await expect(handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctx)).resolves.toBeUndefined();
  });

  it("registers no slash command and records callback-visible secrets without mutation", async () => {
    const home = await mkdtemp(join(tmpdir(), "qb-trace-adapter-")); roots.push(home);
    const handlers = new Map<string, Handler>();
    const pi = { on: vi.fn((name: string, handler: Handler) => handlers.set(name, handler)), registerCommand: vi.fn() } as unknown as ExtensionAPI;
    registerQbTrace(pi, { env: { QB_TRACE_HOME: home }, flushIntervalMs: 60_000, enabledOverride: true });
    const setStatus = vi.fn();
    const ctx = {
      cwd: "/project",
      mode: "tui",
      model: { provider: "test", id: "model" },
      thinkingLevel: "high",
      sessionManager: {
        getSessionId: () => "session-1",
        getSessionFile: () => "/session.jsonl",
      },
      ui: {
        setStatus,
        theme: { fg: (_color: string, text: string) => text },
      },
    } as unknown as ExtensionContext;

    await handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, ctx);
    expect(pi.registerCommand).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenLastCalledWith("qb-trace", "● trace on · 0 events · 0 B");
    const event = { type: "before_provider_headers", headers: { authorization: "Bearer raw-secret" } };
    await handlers.get("before_provider_headers")?.(event, ctx);
    expect(event.headers.authorization).toBe("Bearer raw-secret");
    await handlers.get("before_provider_request")?.({ type: "before_provider_request", payload: { system: "raw-system", tools: [{ name: "read" }] } }, ctx);
    await handlers.get("before_agent_start")?.({ type: "before_agent_start", prompt: "prompt", systemPrompt: "raw-system", systemPromptOptions: {} }, ctx);
    await handlers.get("agent_start")?.({ type: "agent_start" }, ctx);
    await handlers.get("turn_start")?.({ type: "turn_start", turnIndex: 0, timestamp: Date.now() }, ctx);
    await handlers.get("message_start")?.({ type: "message_start", message: { role: "assistant", content: [] } }, ctx);
    await handlers.get("message_update")?.({ type: "message_update", message: { role: "assistant", content: [{ type: "thinking", thinking: "raw-thinking" }] }, assistantMessageEvent: { type: "thinking_delta", delta: "raw-thinking" } }, ctx);
    await handlers.get("tool_execution_start")?.({ type: "tool_execution_start", toolCallId: "call-1", toolName: "read", args: { path: "secret-path" } }, ctx);
    await handlers.get("tool_result")?.({ type: "tool_result", toolCallId: "call-1", toolName: "read", input: { path: "secret-path" }, content: [{ type: "text", text: "raw-result" }], isError: false }, ctx);
    await handlers.get("tool_execution_end")?.({ type: "tool_execution_end", toolCallId: "call-1", toolName: "read", result: { content: "raw-result" }, isError: false }, ctx);
    await handlers.get("tool_execution_start")?.({ type: "tool_execution_start", toolCallId: "call-2", toolName: "bash", args: { command: "exit 1" } }, ctx);
    await handlers.get("tool_execution_end")?.({ type: "tool_execution_end", toolCallId: "call-2", toolName: "bash", result: { content: "raw-failure" }, isError: true }, ctx);
    await handlers.get("message_end")?.({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "raw-output" }], stopReason: "stop" } }, ctx);
    await handlers.get("turn_end")?.({ type: "turn_end", turnIndex: 0, message: { role: "assistant" }, toolResults: [] }, ctx);
    await handlers.get("agent_end")?.({ type: "agent_end", messages: [] }, ctx);
    await handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, ctx);

    const store = new TraceStore(join(home, "traces.sqlite"), { readOnly: true });
    const events = store.listEvents("session-1");
    expect(events.map(item => item.eventType)).toEqual(expect.arrayContaining([
      "before_provider_headers", "before_provider_request", "message_update", "tool_execution_start",
      "tool_result", "tool_execution_end", "message_end", "session_shutdown",
    ]));
    for (const marker of ["Bearer raw-secret", "raw-system", "raw-thinking", "secret-path", "raw-result", "raw-failure", "raw-output"]) {
      expect(events.some(item => item.payloadJson.includes(marker))).toBe(true);
    }
    store.close();
  });

  it("applies the global switch to multiple runtimes without a server or reload", async () => {
    const home = await mkdtemp(join(tmpdir(), "qb-trace-multi-")); roots.push(home);
    await new RecordingConfigStore(home).setEnabled(true);
    const createApp = (sessionId: string) => {
      const handlers = new Map<string, Handler>();
      const setStatus = vi.fn();
      const pi = { on: (name: string, handler: Handler) => { handlers.set(name, handler); } } as unknown as ExtensionAPI;
      registerQbTrace(pi, { env: { QB_TRACE_HOME: home }, flushIntervalMs: 10 });
      const ctx = {
        cwd: "/project", mode: "tui", thinkingLevel: "off",
        sessionManager: { getSessionId: () => sessionId, getSessionFile: () => `/${sessionId}.jsonl` },
        ui: {
          setStatus,
          theme: { fg: (_color: string, text: string) => text },
        },
      } as unknown as ExtensionContext;
      return { handlers, ctx, setStatus };
    };
    const first = createApp("session-a");
    const second = createApp("session-b");
    await first.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, first.ctx);
    await second.handlers.get("session_start")?.({ type: "session_start", reason: "startup" }, second.ctx);
    expect(first.setStatus).toHaveBeenLastCalledWith("qb-trace", expect.stringMatching(/^● trace on · \d+ events · /));
    expect(second.setStatus).toHaveBeenLastCalledWith("qb-trace", expect.stringMatching(/^● trace on · \d+ events · /));
    await first.handlers.get("agent_start")?.({ type: "agent_start" }, first.ctx);
    await second.handlers.get("agent_start")?.({ type: "agent_start" }, second.ctx);

    expect(await runCli(["off"], { stdout() {}, stderr() {} }, { QB_TRACE_HOME: home })).toBe(0);
    await vi.waitFor(() => {
      expect(first.setStatus).toHaveBeenLastCalledWith("qb-trace", expect.stringMatching(/^○ trace off · \d+ events · /));
      expect(second.setStatus).toHaveBeenLastCalledWith("qb-trace", expect.stringMatching(/^○ trace off · \d+ events · /));
    }, { timeout: 1_500 });
    await first.handlers.get("input")?.({ type: "input", text: "must-not-record", source: "interactive" }, first.ctx);
    await first.handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, first.ctx);
    await second.handlers.get("session_shutdown")?.({ type: "session_shutdown", reason: "quit" }, second.ctx);

    const store = new TraceStore(join(home, "traces.sqlite"), { readOnly: true });
    const events = store.listEvents();
    expect(new Set(events.map(event => event.runtimeId)).size).toBe(2);
    expect(events.some(event => event.payloadJson.includes("must-not-record"))).toBe(false);
    expect(store.listControls().at(-1)?.enabled).toBe(0);
    store.close();
  });
});
