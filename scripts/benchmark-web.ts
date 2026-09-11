import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CorrelationState } from "../src/events.ts";
import { TraceQueryService } from "../src/query.ts";
import { TraceStore } from "../src/store.ts";

const root = await mkdtemp(join(tmpdir(), "qb-trace-web-benchmark-"));
const database = join(root, "traces.sqlite");
const store = new TraceStore(database);
const correlation = new CorrelationState("benchmark-runtime");
correlation.beginAgent();
const batch = [];
for (let index = 0; index < 100_000; index++) {
  correlation.beginTurn(Math.floor(index / 20));
  batch.push(correlation.envelope(index % 20 === 0 ? "message_end" : "tool_execution_end", index % 20 === 0
    ? { message: { role: index % 40 === 0 ? "user" : "assistant", content: [{ type: "text", text: `message ${index}` }] } }
    : { toolName: "benchmark", result: { index }, isError: false }, { sessionId: "benchmark", cwd: "/benchmark" }));
  if (batch.length === 500) { store.append(batch.splice(0)); }
}
store.close();

const query = new TraceQueryService(database);
const measure = <T>(name: string, action: () => T): T => {
  const start = performance.now(); const result = action();
  console.log(`${name}: ${(performance.now() - start).toFixed(1)} ms`); return result;
};
measure("session summary", () => query.sessionSummary("benchmark"));
const timeline = measure("timeline page (200)", () => query.timeline({ sessionId: "benchmark" }, 200));
const conversation = measure("conversation source page (200)", () => query.conversation({ sessionId: "benchmark" }, 200));
console.log(`timeline rows: ${timeline.items.length}; conversation rows: ${conversation.items.length}`);
query.close();
const db = new DatabaseSync(database, { readOnly: true });
const plan = db.prepare("EXPLAIN QUERY PLAN SELECT event_id FROM trace_events WHERE session_id = ? ORDER BY timestamp_ms DESC, event_id DESC LIMIT 200").all("benchmark");
console.log("query plan:", JSON.stringify(plan));
db.close();
await rm(root, { recursive: true, force: true });
