import { describe, expect, it } from "vitest";
import { ExecutionProjector } from "./execution.ts";
import { sectionsFor } from "./inspection.ts";
import type { TraceEventDetail } from "../contracts.ts";
const event = (payload: unknown, type = "message_end"): TraceEventDetail => ({
  eventId: "e",
  eventType: type,
  payloadJson: JSON.stringify(payload),
  payloadBytes: 0,
  runtimeId: "r",
  sessionId: "s",
  sequence: 1,
  timestamp: "",
  timestampMs: 1,
  observationStage: type,
  monotonicNs: "1",
  isError: false,
});
describe("typed inspection AC-003", () => {
  it("opens the selected text block rather than returning the first thinking block", () => {
    const e = event({
      message: {
        role: "assistant",
        content: [{ thinking: "reasoning" }, { text: "answer" }],
      },
    });
    const ops = new ExecutionProjector().project(e, 1, () => undefined);
    expect(sectionsFor(ops[1], () => e)[0].text).toBe("answer");
    expect(sectionsFor(ops[0], () => e)[0].text).toBe("reasoning");
  });
  it("shows edit requests as before/after rather than claiming a real file snapshot", () => {
    const e = event(
      {
        toolName: "edit",
        toolCallId: "c",
        args: {
          path: "a.ts",
          edits: [{ oldText: "before", newText: "after" }],
        },
      },
      "tool_execution_start",
    );
    const op = new ExecutionProjector().project(e, 1, () => undefined)[0];
    const sections = sectionsFor(op, () => e);
    expect(sections[1]).toMatchObject({
      format: "diff",
      before: "before",
      after: "after",
    });
    expect(sections[1].label).toContain("不代表实际文件快照");
  });
  it("never reads image paths/URLs and only exposes bounded recorded raster data", () => {
    const e = event({
      message: {
        role: "user",
        content: [
          { type: "image", url: "https://evil/image", path: "/private/file" },
        ],
      },
    });
    const op = new ExecutionProjector().project(e, 1, () => undefined)[0];
    const section = sectionsFor(op, () => e)[0];
    expect(section.format).toBe("text");
    expect(section.text).toContain("不会读取");
  });
});
