import { createHash, randomUUID } from "node:crypto";
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Standalone producer: only Pi public API; no QB Trace dependency. */
export default function instrumentedTool(pi: ExtensionAPI) {
  pi.registerTool({
    name: "trace_sha256",
    label: "Trace SHA-256",
    description:
      "Compute SHA-256 of supplied text, with optional QB Trace spans.",
    parameters: Type.Object({ text: Type.String() }),
    async execute(_toolCallId, params, signal) {
      const spanId = randomUUID();
      const base = { version: 1, namespace: "example-sha256", spanId };
      const emit = (event: Record<string, unknown>) =>
        pi.events.emit("qb-trace:v1", { ...base, ...event });
      emit({
        action: "span.start",
        name: "计算 SHA-256",
        attributes: { inputBytes: Buffer.byteLength(params.text) },
      });
      try {
        signal?.throwIfAborted();
        const hash = createHash("sha256").update(params.text).digest("hex");
        const child = randomUUID();
        emit({
          action: "span.start",
          spanId: child,
          parentSpanId: spanId,
          name: "构建摘要产物",
        });
        emit({
          action: "artifact.attach",
          spanId: child,
          parentSpanId: spanId,
          artifact: {
            type: "json",
            name: "digest.json",
            text: JSON.stringify({ algorithm: "sha256", hash }),
          },
        });
        emit({
          action: "span.end",
          spanId: child,
          parentSpanId: spanId,
          status: "completed",
        });
        emit({ action: "span.end", status: "completed" });
        return {
          content: [{ type: "text", text: hash }],
          details: { algorithm: "sha256" },
        };
      } catch (error) {
        emit({
          action: "span.end",
          status: signal?.aborted ? "cancelled" : "error",
          attributes: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        throw error;
      }
    },
  });
}
