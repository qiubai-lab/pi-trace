import { CorrelationState, type TraceEnvelope } from "../events.ts";
/** Synthetic, secret-free QA fixture; never presented as a real agent session. */
export function executionFixture(
  turns = 12,
  sessionId = "demo-execution",
): TraceEnvelope[] {
  const c = new CorrelationState("demo-runtime");
  const events: TraceEnvelope[] = [];
  let tick = Date.parse("2026-09-11T08:00:00Z");
  const add = (type: string, payload: unknown, advance = 100) => {
    const e = c.envelope(type, payload, {
      sessionId,
      cwd: "/workspace/agent-lab",
      provider: "openai",
      model: "gpt-5.4",
    });
    e.timestampMs = tick;
    e.timestamp = new Date(tick).toISOString();
    e.monotonicNs = String(BigInt(tick) * 1_000_000n);
    tick += advance;
    events.push(e);
  };
  add("session_start", { reason: "startup", syntheticFixture: true });
  add("trace_resources", {
    tools: [
      {
        name: "read",
        sourceInfo: { path: "<builtin:read>", source: "builtin" },
      },
      {
        name: "browser",
        sourceInfo: {
          path: "example-browser/index.ts",
          source: "example-browser",
        },
      },
    ],
    commands: [
      {
        name: "skill:review",
        source: "skill",
        sourceInfo: { path: "/workspace/skills/review/SKILL.md" },
      },
    ],
  });
  c.beginAgent();
  add("before_agent_start", {
    prompt: "分析这个插件的实现，修复回归并验证执行流程。",
    systemPrompt:
      "# Agent Lab\n\n这是用于 QA 的合成追踪数据，不是真实运行。\n\n- 检查实现\n- 验证关键行为\n- 记录证据",
    systemPromptOptions: {
      skills: [
        { name: "review", filePath: "/workspace/skills/review/SKILL.md" },
      ],
    },
  });
  add("agent_start", {});
  c.beginMessage();
  add("message_end", {
    message: {
      role: "user",
      content: [{ text: "请评估插件实现，修复回归，并给出验证证据。" }],
    },
  });
  c.endMessage();
  for (let i = 0; i < turns; i++) {
    c.beginTurn(i);
    add("turn_start", { turnIndex: i });
    add("context", {
      messages: [{ role: "user", content: [{ text: `上下文快照 ${i + 1}` }] }],
      source: "fixture",
    });
    add("before_provider_headers", {
      headers: { authorization: "Bearer synthetic-fixture-only" },
    });
    add(
      "before_provider_request",
      {
        payload: {
          model: "gpt-5.4",
          instructions: "检查插件并验证",
          input: [{ role: "user", content: "检查" }],
        },
      },
      1200,
    );
    add(
      "after_provider_response",
      { status: 200, headers: { "content-type": "text/event-stream" } },
      450,
    );
    c.beginMessage();
    add("message_start", { message: { role: "assistant", content: [] } });
    for (let j = 0; j < 16; j++)
      add(
        "message_update",
        {
          message: {
            role: "assistant",
            content: [
              {
                thinking: `先检查执行关联，再验证数据边界。${"逐步分析。".repeat(j + 1)}`,
              },
            ],
          },
        },
        30,
      );
    add("message_end", {
      message: {
        role: "assistant",
        content: [
          { thinking: "先检查执行关联，再验证数据边界。" },
          {
            text: `### 第 ${i + 1} 轮\n\n并行读取实现与技能说明，然后运行验证。`,
          },
          {
            type: "toolCall",
            id: `read-${i}`,
            name: "read",
            arguments: { path: "/workspace/skills/review/SKILL.md" },
          },
          {
            type: "toolCall",
            id: `bash-${i}`,
            name: "bash",
            arguments: { command: "npm test -- --run" },
          },
        ],
        stopReason: "toolUse",
      },
    });
    c.endMessage();
    add("tool_execution_start", {
      toolCallId: `read-${i}`,
      toolName: "read",
      args: {
        path: "/workspace/skills/review/SKILL.md",
        offset: 1,
        limit: 200,
      },
    });
    add("tool_call", {
      toolCallId: `read-${i}`,
      toolName: "read",
      input: { path: "/workspace/skills/review/SKILL.md" },
    });
    add("tool_execution_start", {
      toolCallId: `bash-${i}`,
      toolName: "bash",
      args: { command: "npm test -- --run" },
    });
    add("qb_span", {
      version: 1,
      namespace: "example.review",
      action: "span.start",
      spanId: `review-${i}`,
      name: "验证回归保护",
      attributes: { phase: "test", fixture: true },
    });
    add(
      "tool_result",
      {
        toolCallId: `read-${i}`,
        toolName: "read",
        content: [
          {
            type: "text",
            text: "---\nname: review\ndescription: 检查关键行为\n---\n\n# Review\n\n1. 检查事件关联\n2. 检查缺失边界\n3. 运行回归验证",
          },
        ],
        isError: false,
      },
      150,
    );
    add(
      "tool_execution_end",
      {
        toolCallId: `read-${i}`,
        toolName: "read",
        result: {
          content: [{ type: "text", text: "# Review\n\n检查关键行为。" }],
        },
        isError: false,
      },
      700,
    );
    add(
      "tool_execution_update",
      {
        toolCallId: `bash-${i}`,
        toolName: "bash",
        partialResult: { content: [{ text: "Running tests…" }] },
      },
      350,
    );
    const failed = i % 7 === 2;
    const output = failed
      ? "FAIL execution.test.ts\nExpected input and result to share a tool ID.\nRegression marker: call-correlation"
      : "Test Files  12 passed (12)\nTests  64 passed (64)\nDuration  842ms";
    add("tool_result", {
      toolCallId: `bash-${i}`,
      toolName: "bash",
      content: [{ type: "text", text: output }],
      details: { exitCode: failed ? 1 : 0 },
      isError: failed,
    });
    add("tool_execution_end", {
      toolCallId: `bash-${i}`,
      toolName: "bash",
      result: {
        content: [{ type: "text", text: output }],
        details: { exitCode: failed ? 1 : 0 },
      },
      isError: failed,
    });
    add("qb_span", {
      version: 1,
      namespace: "example.review",
      action: "span.start",
      spanId: `evidence-${i}`,
      parentSpanId: `review-${i}`,
      name: "整理验证证据",
    });
    add("qb_span", {
      version: 1,
      namespace: "example.review",
      action: "artifact.attach",
      spanId: `evidence-${i}`,
      artifact: { name: "测试报告", type: "text", text: output },
    });
    add("qb_span", {
      version: 1,
      namespace: "example.review",
      action: "span.end",
      spanId: `evidence-${i}`,
      status: "completed",
    });
    add("qb_span", {
      version: 1,
      namespace: "example.review",
      action: "span.end",
      spanId: `review-${i}`,
      status: failed ? "error" : "completed",
    });
    if (failed) {
      add("tool_execution_start", {
        toolCallId: `edit-${i}`,
        toolName: "edit",
        args: {
          path: "src/events.ts",
          edits: [
            {
              oldText: "selected = event.eventId",
              newText: "selected = operation.id",
            },
          ],
        },
      });
      add("tool_execution_end", {
        toolCallId: `edit-${i}`,
        toolName: "edit",
        result: { content: [{ text: "Successfully replaced 1 block." }] },
        isError: false,
      });
    }
    if (i === 3) {
      add(
        "ui_prompt_start",
        { kind: "confirm", title: "是否继续验证？" },
        5000,
      );
      add("ui_prompt_end", {});
    }
    if (i === 6) {
      add("session_before_compact", { reason: "threshold" }, 2400);
      add("session_compact", {
        reason: "threshold",
        compactionEntry: {
          summary: "已完成执行关联与回归检查",
          tokensBefore: 32000,
        },
      });
    }
    add("turn_end", { turnIndex: i });
    c.endTurn();
  }
  add("agent_end", {});
  c.endAgent();
  add("agent_settled", {});
  add("session_shutdown", { reason: "quit" });
  return events;
}
