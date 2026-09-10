# Architecture Specification

## Product boundary

`@qiubai-lab/pi-trace` independently owns local Pi execution tracing. It has no runtime dependency on `pi-plugins`; users install and configure the two packages separately.

## Runtime boundaries

- `src/index.ts` adapts Pi lifecycle events and composes one runtime collector. It does not own persistence or CLI policy.
- `src/cli-entry.ts` and `bin/qb-trace` are thin process adapters over `src/cli.ts`.
- `src/config.ts` owns the atomic global recording switch and live polling.
- `src/events.ts` owns full-payload serialization, event identity and correlation.
- `src/collector.ts` owns bounded batching, retry, fail-open drop accounting and bounded shutdown.
- `src/store.ts` exclusively owns schema versioning and SQLite writes.
- `src/diagnostics.ts` owns database-independent error and gap state.
- `src/query.ts` is the read-only boundary for status and any future Server.
- `src/status.ts` owns display-only TUI storage statistics and polling; failures never control or block collection.
- `src/cli.ts` owns explicit manual prune policy, while `src/store.ts` exclusively owns its SQLite transaction and compaction operations.

Dependencies point from entry adapters toward these capability modules. Modules must not import private files from other Pi packages. A future HTTP/UI Server may depend on the read-only query boundary, but collection, switching and schema ownership must never depend on that Server.

## Stable data contract

The default global home remains `~/.pi/agent/qb-trace/`. SQLite is the sole authoritative Trace store, uses WAL and schema 1, and is shared across Sessions and Runtime processes. Recording is append-only and fail-open. The collector retains the complete callback-visible payload without plugin-level redaction or truncation and never performs automatic retention. Explicit CLI pruning may transactionally delete selected `trace_events` only while recording is off; recording controls, configuration and diagnostics remain outside that deletion boundary.

## Verification entrypoints

- `npm test`
- `npm run typecheck`
- `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh`
- `pi -ne -e .` for target-only package discovery
