import { mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TraceStore } from "../src/store.ts";
import { executionFixture } from "../src/testing/execution-fixture.ts";
import { resolveTracePaths } from "../src/paths.ts";
import { startTraceServer } from "../src/server.ts";
const home =
  process.env.QB_PREVIEW_HOME ??
  (await mkdtemp(join(tmpdir(), "qb-trace-preview-")));
const paths = resolveTracePaths({ QB_TRACE_HOME: home });
const events = executionFixture(24);
if (!existsSync(paths.database)) {
  const store = new TraceStore(paths.database);
  for (let i = 0; i < events.length; i += 100)
    store.append(events.slice(i, i + 100));
  store.close();
}
const server = await startTraceServer(paths, {
  port: Number(process.env.QB_PREVIEW_PORT ?? 0),
});
console.log(
  JSON.stringify({
    url: server.url,
    home,
    synthetic: true,
    events: events.length,
  }),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void server.close().then(() => process.exit(0));
  });
