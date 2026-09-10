import { randomUUID } from "node:crypto";

export const TRACE_SCHEMA_VERSION = 1;

export interface TraceContextSnapshot {
  sessionId: string;
  sessionFile?: string;
  cwd?: string;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
}

export interface TraceEnvelope extends TraceContextSnapshot {
  schemaVersion: 1;
  eventId: string;
  eventType: string;
  timestamp: string;
  timestampMs: number;
  monotonicNs: string;
  runtimeId: string;
  sequence: number;
  agentRunId?: string;
  turnIndex?: number;
  messageId?: string;
  toolCallId?: string;
  observationStage: string;
  payloadJson: string;
  payloadBytes: number;
}

function normalize(value: unknown, seen: WeakMap<object, string>, path: string): unknown {
  if (value === undefined) return { $undefined: true };
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (typeof value === "number" && !Number.isFinite(value)) return { $number: String(value) };
  if (typeof value === "function") return { $function: value.name || "anonymous" };
  if (typeof value === "symbol") return { $symbol: value.description ?? "" };
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) {
    return { $error: { name: value.name, message: value.message, stack: value.stack, cause: normalize(value.cause, seen, `${path}.cause`) } };
  }
  if (value instanceof Uint8Array) return { $bytesBase64: Buffer.from(value).toString("base64") };
  if (value instanceof Date) return { $date: value.toISOString() };
  const previous = seen.get(value);
  if (previous) return { $reference: previous };
  seen.set(value, path);
  if (Array.isArray(value)) return value.map((item, index) => normalize(item, seen, `${path}[${index}]`));
  const output: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") continue;
    try {
      output[key] = normalize((value as Record<string, unknown>)[key], seen, `${path}.${key}`);
    } catch (error) {
      output[key] = { $unreadable: error instanceof Error ? error.message : String(error) };
    }
  }
  return output;
}

export function serializePayload(value: unknown): string {
  return JSON.stringify(normalize(value, new WeakMap(), "$"));
}

function field(payload: unknown, name: string): unknown {
  return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)[name] : undefined;
}

export class CorrelationState {
  readonly runtimeId: string;
  private sequence = 0;
  private agentRunId?: string;
  private turnIndex?: number;
  private messageId?: string;

  constructor(runtimeId: string = randomUUID()) { this.runtimeId = runtimeId; }

  beginAgent(): string {
    this.agentRunId = randomUUID();
    this.turnIndex = undefined;
    return this.agentRunId;
  }

  ensureAgent(): string { return this.agentRunId ?? this.beginAgent(); }
  endAgent(): void { this.agentRunId = undefined; this.turnIndex = undefined; }
  beginTurn(index: number): void { this.turnIndex = index; }
  endTurn(): void { this.turnIndex = undefined; }
  beginMessage(): string { this.messageId = randomUUID(); return this.messageId; }
  endMessage(): void { this.messageId = undefined; }

  envelope(eventType: string, payload: unknown, context: TraceContextSnapshot, observationStage = eventType): TraceEnvelope {
    const sequence = ++this.sequence;
    const timestampMs = Date.now();
    const payloadJson = serializePayload(payload);
    const toolCallId = field(payload, "toolCallId");
    return {
      schemaVersion: TRACE_SCHEMA_VERSION,
      eventId: `${this.runtimeId}:${sequence}`,
      eventType,
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      monotonicNs: process.hrtime.bigint().toString(),
      runtimeId: this.runtimeId,
      sequence,
      agentRunId: this.agentRunId,
      turnIndex: this.turnIndex,
      messageId: this.messageId,
      toolCallId: typeof toolCallId === "string" ? toolCallId : undefined,
      observationStage,
      ...context,
      payloadJson,
      payloadBytes: Buffer.byteLength(payloadJson),
    };
  }
}
