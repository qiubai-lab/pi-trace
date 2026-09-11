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
- `src/contracts.ts` owns canonical read-model and Web API DTO contracts; storage rows, HTTP shapes and React state are not treated as one model.
- `src/query.ts` is the cursor-paginated read-only boundary for status and the local Server; list DTOs exclude full payloads.
- `src/analysis/` owns framework-independent Session summary, timeline hierarchy and conversation projection semantics. It does not depend on React, HTTP or SQLite and never fabricates missing conversation content.
- `src/server.ts` composes loopback HTTP lifecycle; `src/server/` owns ephemeral authentication, security headers, bounded API routing and SSE cleanup. HTTP adapters call the public query/analysis boundaries and do not issue SQL.
- `src/web/` owns the React Session workbench, remote-state presentation, virtualized lists, URL workspace state and Apple-guided interaction design. It has no storage or mutation capability.
- `src/web-assets.ts` serves the generated same-origin Vite bundle from `dist/web/`; runtime Web assets never depend on a CDN, remote font or separate frontend service.
- `src/status.ts` owns display-only TUI storage statistics and polling; failures never control or block collection.
- `src/cli.ts` owns explicit manual prune policy, while `src/store.ts` exclusively owns its SQLite transaction and compaction operations.

Dependencies point from entry adapters toward capability modules: React/HTTP adapters depend on explicit contracts and application projections, which depend on the read-only query boundary, which alone reaches `src/store.ts`. Reverse dependencies and cross-layer private imports are forbidden. Modules must not import private files from other Pi packages.

The Web frontend uses React, TypeScript and Vite. TanStack Query owns remote cache state, TanStack Virtual bounds long-list DOM, and focused resizable panels provide direct pointer and keyboard manipulation. Session/view/filter/Event selection belongs in a token-free URL; transient panel and disclosure state remains local unless a real cross-feature consumer requires broader state. Generated assets are built reproducibly and served by the package on the same origin.

The HTTP/UI Server is a local personal diagnostic surface: it defaults to loopback-only access and depends only on read-only query capabilities. Collection, switching, pruning and schema ownership must never depend on that Server. Remote/LAN access, multi-user authorization and writable Web operations are outside this boundary unless a later explicit decision replaces it.

## Stable data contract

The default global home remains `~/.pi/agent/qb-trace/`. SQLite is the sole authoritative Trace store, uses WAL and schema 1, and is shared across Sessions and Runtime processes. Recording is append-only and fail-open. The collector retains the complete callback-visible payload without plugin-level redaction or truncation and never performs automatic retention. Explicit CLI pruning may temporarily set recording off, wait for runtime propagation, transactionally delete selected `trace_events`, then checkpoint WAL and vacuum storage by default. It conditionally restores the original on state without overwriting a concurrent config write. Recording controls, configuration and diagnostics remain outside the deletion boundary.

## Verification entrypoints

- `npm test`
- `npm run typecheck`
- `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh`
- `pi -ne -e .` for target-only package discovery
