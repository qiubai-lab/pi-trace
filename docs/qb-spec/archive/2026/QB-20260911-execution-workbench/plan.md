---
id: QB-20260911-execution-workbench
type: design
tier: strict
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---
# Implementation plan
Spec: QB-20260911-execution-workbench (paired spec with the same change ID).

- TASK-001 [REQ-001, REQ-006; AC-001, AC-006]: tests first for projection/order; implement framework-free execution contracts/reducer and rebuildable SQLite sidecar in store-owned modules. Preserve original schema.
- TASK-002 [depends: TASK-001] [REQ-003; AC-003]: evidence-backed content extraction and bounded inspector query, with explicit observation stages and masked presentation.
- TASK-003 [depends: TASK-001] [REQ-004, REQ-006; AC-004, AC-006]: worker collector/index query service, committed cursor Live with cancellation, bounded queues and shutdown.
- TASK-004 [depends: TASK-001] [REQ-005; AC-005]: validated event-bus instrumentation, provenance snapshots, example and integration tests.
- TASK-005 [depends: TASK-002, TASK-003] [REQ-002, REQ-007; AC-002, AC-007]: replace app shell with execution workspace, windowed virtual rows, filters, overview, independent resizable Inspector and three linked views.
- TASK-006 [depends: TASK-005] [REQ-004, REQ-007; AC-004, AC-007]: replay controls with historical cutoff; active-only explanatory motion and accessibility fallbacks.
- TASK-007 [depends: TASK-004, TASK-006] [REQ-001..007; AC-001..007]: regression/security/worker checks, benchmark and browser evidence; update Directory Map, README, trace protocol documentation.

## Boundary decision
Domain semantics live in src/analysis; SQLite and rebuild lifecycle in src/storage; HTTP only validates/adapts queries; workers own off-thread tasks; React only owns view/selection. Raw events, derived operations, API pages and local view state remain separate. Do not add server frameworks, SSR, a remote backend or a global freeform node canvas. Existing React/Virtual/Query dependencies suffice for bounded layout; native CSS/WAAPI handle explanatory animation without adding an unnecessary dependency.

## Verification mapping
- VER-001 [AC-001]: execution projection/order/regression tests.
- VER-002 [AC-002]: workspace component + server route tests and browser execution/search/deep link/views.
- VER-003 [AC-003]: inspector extraction/masking/slicing tests and browser typed detail.
- VER-004 [AC-004]: ingestion cursor/replay regression tests and browser playback/Live.
- VER-005 [AC-005]: instrumentation tests and example fixture spans.
- VER-006 [AC-006]: collector/worker/store/index rebuild and existing CLI/server security tests.
- VER-007 [AC-007]: npm test, npm run typecheck, benchmark, shell syntax checks, browser layout/accessibility.

## Progress and evidence
TASK-001..007 completed. Detailed evidence, environment, measured budgets and screenshots: `docs/verification-execution-workbench.md` (repository-relative).

- VER-001 / AC-001: `src/analysis/execution.test.ts`, `src/storage/execution-index.test.ts`; independent content identities, parallel lifecycle/error merging, stable numeric order and interrupted boundaries.
- VER-002 / AC-002: `src/web/app/App.test.tsx`, workspace URL tests, execution routes; browser three views, combined search/type/failure filters and deep target outside the visible window.
- VER-003 / AC-003: `src/analysis/inspection.test.ts`, storage slicing/search tests; browser separate Thinking/Text, Shell input/output/details, edit Before/After, source events and Raw.
- VER-004 / AC-004: `src/execution-service.test.ts`, historical index tests; committed late events, Session-specific cursor, reconnect/reset and future Raw rejection. Browser historical input-only state then 16× advancement reveals final output; real append raises 908 to 909 without changing URL/scroll/selection.
- VER-005 / AC-005: `src/instrumentation.test.ts`, stored artifact tests; validates namespaces/parents/cancellation, preserves artifacts and executes the standalone public-API SHA-256 example. `docs/instrumentation.md` specifies boundaries.
- VER-006 / AC-006: collector/index/service/install/CLI/server regressions; worker runs from temporary node_modules, raw prune triggers rebuild, cache readers restore a shared durable checkpoint. Real Pi RPC startup/get_state/shutdown exits 0 and records six schema-1 events with zero storage errors/drops.
- VER-007 / AC-007: typecheck and full build/test PASS (19 files / 69 tests); shell syntax and diff whitespace PASS; package dry-run includes Web, Worker and example artifacts. Browser keyboard resizing, Tab navigation, native modal focus, 760/390px and reduced-motion PASS. 100,684-event benchmark: 100-row page 69.8ms, history 172.7ms, cold rebuild 20.04s; no FPS/SLA claim.

## Quality gate and remaining scope
All required AC/VER mappings have direct evidence. The browser checklist `execution-workbench-v2` is ready and audited; three representative synthetic-data screenshots are retained in `docs/evidence/execution-workbench/`.

Old conversation/modal components and their exclusively used formatting worker are removed; legacy external v1 APIs remain intentionally supported. SQL is absent from HTTP/Web/domain semantics. Inspection depends on a small reader port, not concrete SQLite storage. Raw schema, capture payload policy and CLI ownership are unchanged.

Locality review retained the cohesive Workbench orchestration, Inspector modes and ExecutionIndex owner instead of adding forwarding layers merely to reduce line counts. UI conforms to existing dark, quiet, keyboard-first workbench guidance; no inferred long-lived style preference was persisted. Directory Map and user-facing documentation are updated. The new storage/Worker topology remains an explicit approved change decision rather than an automatic edit to long-lived context.

Residual limits: no Pi core/internal-handler visibility without cooperation; raw/FTS data remain sensitive; browser checks used the smaller fixture, not a 100k-event FPS run; Node 24/Linux/Chromium were exercised. The environment's npm wrapper did not actually select Node 22, so that attempted smoke is not counted as Node 22 evidence. Other platform/version matrices remain follow-up coverage, not a claimed pass.
