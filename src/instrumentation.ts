/** Optional cooperative tracing via Pi's public event bus. No collector dependency for producers. */
export const TRACE_BUS_EVENT = "qb-trace:v1";
export interface TraceSignal {
  version: 1;
  namespace: string;
  action: "span.start" | "span.event" | "span.end" | "artifact.attach";
  spanId: string;
  parentSpanId?: string;
  name?: string;
  status?: "completed" | "error" | "cancelled";
  attributes?: Record<string, unknown>;
  artifact?: {
    name: string;
    type: "text" | "markdown" | "json" | "image" | "file" | "diff";
    path?: string;
    text?: string;
    data?: string;
    mimeType?: string;
  };
}
export function validTraceSignal(value: unknown): value is TraceSignal {
  if (!value || typeof value !== "object") return false;
  try {
    const p = value as Partial<TraceSignal>;
    return (
      p.version === 1 &&
      typeof p.namespace === "string" &&
      /^[a-z][a-z0-9._-]{0,79}$/.test(p.namespace) &&
      typeof p.spanId === "string" &&
      /^[A-Za-z0-9._-]{1,160}$/.test(p.spanId) &&
      (p.parentSpanId === undefined ||
        (typeof p.parentSpanId === "string" &&
          /^[A-Za-z0-9._-]{1,160}$/.test(p.parentSpanId) &&
          p.parentSpanId !== p.spanId)) &&
      ["span.start", "span.event", "span.end", "artifact.attach"].includes(
        p.action ?? "",
      ) &&
      (p.name === undefined ||
        (typeof p.name === "string" && p.name.length <= 240)) &&
      (p.status === undefined ||
        ["completed", "error", "cancelled"].includes(p.status)) &&
      (p.attributes === undefined ||
        Boolean(
          p.attributes &&
            typeof p.attributes === "object" &&
            !Array.isArray(p.attributes),
        )) &&
      (p.action !== "artifact.attach" ||
        Boolean(
          p.artifact &&
            typeof p.artifact.name === "string" &&
            p.artifact.name.length <= 240 &&
            ["text", "markdown", "json", "image", "file", "diff"].includes(
              p.artifact.type,
            ) &&
            [
              p.artifact.text,
              p.artifact.path,
              p.artifact.data,
              p.artifact.mimeType,
            ].every(
              (field) => field === undefined || typeof field === "string",
            ),
        ))
    );
  } catch {
    return false;
  }
}
export function emitTrace(
  bus: { emit(name: string, value: unknown): void },
  signal: TraceSignal,
): void {
  if (!validTraceSignal(signal)) throw new Error("invalid qb-trace signal");
  bus.emit(TRACE_BUS_EVENT, signal);
}
