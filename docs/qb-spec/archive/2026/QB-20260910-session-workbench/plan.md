---
id: QB-20260910-session-workbench
type: design
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Implementation plan: React Session analysis workbench

## Inputs

- Approved scope: `docs/qb-spec/specs/QB-20260910-session-workbench.md`
- Existing architecture: `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- Design guidance: repository skill `apple-design`
- Existing compatibility baseline: current Server, query, CLI, collector, store, and package tests

## Tasks

- TASK-001 [done] [REQ-011, REQ-012, AC-010, AC-011] Establish the pre-change behavior baseline: run existing tests/typecheck/shell checks, characterize static-asset security/token behavior and raw API compatibility, and record any pre-existing failures before structural replacement.
- TASK-002 [done] [depends: TASK-001] [REQ-001, REQ-011, REQ-012, AC-001, AC-010, AC-011] Add React/Vite dependencies, browser TypeScript/build configuration, generated-asset contract, and package scripts. Keep CLI/package discovery runnable from a clean checkout and prohibit remote runtime assets.
- TASK-003 [done] [depends: TASK-001] [REQ-003, REQ-004, REQ-005, REQ-008, AC-003, AC-004, AC-005, AC-007] Define shared bounded DTOs and framework-independent Session summary, run/turn timeline, and conversation projection rules. Protect deterministic grouping, missing-correlation placement, source links, unknown payload shapes, preview byte limits, and cursor boundaries with focused tests before HTTP/UI integration.
- TASK-004 [done] [depends: TASK-003] [REQ-003, REQ-004, REQ-005, REQ-008, REQ-011, REQ-012, AC-003, AC-004, AC-005, AC-007, AC-010, AC-011] Add indexed/bounded read queries and additive authenticated routes while preserving old `/api/v1` behavior. Capture query-plan and timing evidence on a generated 100,000-event Session; add an index/schema change only if evidence requires it and then add compatibility/recovery coverage.
- TASK-005 [done] [depends: TASK-002, TASK-004] [REQ-001, REQ-002, REQ-003, REQ-006, REQ-011, AC-001, AC-002, AC-003, AC-010] Build the React application shell, token bootstrap, safe URL workspace state, API client, remote-state ownership, error boundaries, Session navigation, summary header, and resizable three-region desktop workspace with explicit loading/empty/error/retry states.
- TASK-006 [done] [depends: TASK-005] [REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, AC-002, AC-004, AC-005, AC-006, AC-007] Implement virtualized structured/raw timeline, collapsible run/turn hierarchy, conversation view, source-linked cross-view navigation, shared filters/selection, and lazy structured/raw Event detail including malformed and large payload fallback.
- TASK-007 [done] [depends: TASK-006] [REQ-008, REQ-009, AC-007, AC-008] Integrate SSE with bounded query-cache updates, live/disconnected/retry status, scroll/selection preservation, and cleanup on Session change, unmount, abort, and Server shutdown. Verify that neither browser requests nor rendered DOM scale with all Session events.
- TASK-008 [done] [depends: TASK-006] [REQ-002, REQ-010, REQ-011, AC-002, AC-009, AC-010] Apply the Apple-guided visual system and interaction polish: system typography, deliberate hierarchy, restrained translucent chrome, direct panel manipulation, instant press/focus feedback, spatially consistent transitions, and reduced-motion/transparency/increased-contrast variants. Complete keyboard and accessibility checks without decorative motion blocking input.
- TASK-009 [done] [depends: TASK-007, TASK-008] [REQ-001, REQ-011, REQ-012, AC-001, AC-010, AC-011] Remove the obsolete string-asset implementation and transitional paths, update README and the Directory Map to real commands/ownership, and ensure production assets are present through the documented build/package path.
- TASK-010 [done] [depends: TASK-009] [REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009, REQ-010, REQ-011, REQ-012, AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-011] Run strict completion verification, record actual evidence and limitations, and archive only if all acceptance gates have sufficient evidence.

## Verification mapping

- VER-001 [AC-001] Run clean frontend production build, frontend tests/typecheck, package typecheck/tests, and inspect emitted HTML/assets for external origins.
- VER-002 [AC-002] Run browser-level workspace-state coverage for Session/view/filter/Event URL restoration and pointer/keyboard panel resizing; inspect URL for token leakage.
- VER-003 [AC-003] Run Session summary service/API/component fixtures covering populated, partial-context, empty, unavailable, busy, and retry states.
- VER-004 [AC-004] Run timeline projection/API/component tests for hierarchy, deterministic order/cursors, disclosure behavior, missing correlation, raw fallback, error cues, and payload omission.
- VER-005 [AC-005] Run conversation fixtures spanning user/assistant messages, tool calls/results, malformed/unknown payloads, bounded previews, source links, and timeline navigation.
- VER-006 [AC-006] Run detail tests for lazy fetch, metadata, structured/raw modes, malformed JSON, generated large payload, and byte-for-byte access to raw stored text.
- VER-007 [AC-007] Generate a 100,000-event Session and record page-cap, cursor, query-plan, timing, request-volume, cache, and rendered-row evidence; fail on any whole-Session browser fetch/render path.
- VER-008 [AC-008] Run SSE integration/component tests for bounded append/invalidation, disconnect/retry status, selection/scroll behavior, and resource cleanup.
- VER-009 [AC-009] Run keyboard-only component/browser checks and accessibility assertions for names, roles, focus visibility, text scaling, reduced motion, reduced transparency, and increased contrast.
- VER-010 [AC-010] Run HTTP/static security regression tests for Host/method/token enforcement, headers, no CORS/write route/external asset, sensitive warning, and bounded DTO payload omission.
- VER-011 [AC-011] Run `npm test`, package and frontend typechecks/build, `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh`, `pi -ne -e .`, and an isolated authenticated HTTP smoke test against production assets.

## Architecture and behavior gates

- Before TASK-003 through TASK-008, check that projection rules remain independent of React/HTTP/SQLite, Server handlers do not acquire storage ownership, Web imports only public DTO/API boundaries, and no cyclic dependency is introduced.
- Establish focused behavior tests before replacing current token bootstrap, security headers, list payload omission, cursor semantics, or SSE cleanup.
- Treat conversation extraction as critical transformation logic: unknown shapes degrade explicitly and never become fabricated role/content.
- Update the structural map after paths and ownership stabilize, before final verification.

## Recovery checkpoints

- Frontend scaffold can be removed while the old static page remains served until TASK-005 is integrated.
- New APIs are additive; reverting their route registration does not affect existing raw APIs or storage.
- Do not remove `src/web.ts` until production React assets pass the same-origin/security smoke test.
- Avoid schema changes unless the 100,000-event evidence requires them. If required, isolate and verify migration/compatibility before frontend reliance.

## Verification evidence

- Spec quality review: **PASS WITH NOTES**. REQ/AC/Delta traceability is closed; exact package versions, preview budget, benchmark observations, and visual token values remain constrained implementation decisions rather than requirement gaps.
- Baseline before replacement: `npm test` passed 10 files / 37 tests; `npm run typecheck` and shell syntax checks passed.
- VER-001: `npm test` rebuilt the production React bundle and passed 15 files / 51 tests; `npm run typecheck` passed package and browser projects. `npm pack --dry-run` included hashed JS/CSS, the JSON formatting Worker, and HTML (153.4 kB package, 54 files).
- VER-003 through VER-006: projection, query/API, workspace, URL/token, malformed payload, and 100,000-character payload tests passed. Conversation projections are source-linked and ignore unknown shapes rather than fabricating rows.
- VER-007: `npm run benchmark:web` generated one 100,000-event Session. Observed locally: Session summary 188.7 ms, timeline page of 200 rows 6.7 ms, conversation source page of 200 rows 10.0 ms. SQLite used `idx_trace_events_session_time`; the final Event-ID tie-break used a temporary B-tree, but measured page latency did not justify a schema migration.
- VER-008 and VER-010: authenticated HTTP/SSE regression tests passed, including Host/token/method enforcement, bounded DTOs, additive endpoints, headers, stream abort, and Server close cleanup.
- VER-011: `sh -n bin/qb-trace scripts/install-qb-trace-cli.sh`, `pi -ne -e .`, and production dependency audit passed; `npm audit --omit=dev` found 0 vulnerabilities.
- Architecture gate: analysis imports only canonical contracts; Web source has no Node/storage/query imports; Server routes use the public query boundary; the obsolete `src/web.ts` path is removed; `docs/qb-spec/DIRECTORY_MAP.md` reflects the new ownership.

## Browser acceptance evidence

- VER-002: BetterWright Chromium selected the 100,000-event Session, restored Session/Conversation/`message_end` filter/Event detail after reload, and confirmed the proof URL contains no token query or fragment. Pointer drag changed the Sessions panel from 207.45px to 276.95px; keyboard ArrowRight on the focusable separator changed it to 301.75px.
- VER-005 and VER-006: Conversation visibly rendered source-linked User, Assistant, and Tool cards; selecting a card opened the corresponding `message_end` Inspector with metadata plus Structured/Raw controls.
- VER-007: The 100,000-event Session visibly rendered only 22 virtual rows/19 Event rows while preserving Agent Run and Turn hierarchy.
- VER-008: Live visibly progressed from `connecting` to `live` after an appended Event; summary changed to 100,001 Events/2 Agent runs without losing Session, view, URL Event ID, or Inspector selection.
- VER-009: Search filtering and Arrow-key Session focus passed. Chromium reduced-motion and increased-contrast emulation produced 0.00001s transitions, higher-contrast `#c4c8d0` secondary text, and legible solid borders/surfaces. Chromium parsed the reduced-transparency rule; the automated media-rule test covers its solid/no-blur declarations.
- BetterWright evidence checklist `QB Trace Session workbench acceptance` audited all 10 requirements ready with no pending proof items. Proof artifacts are retained under `/root/.betterwright/artifacts/85b42e1702877c85/`.

## Authorization

The user explicitly approved the shaped direction and requested spec/plan persistence and implementation on 2026-09-10.
