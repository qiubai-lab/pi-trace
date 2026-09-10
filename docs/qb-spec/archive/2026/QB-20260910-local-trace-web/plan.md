---
id: QB-20260910-local-trace-web
type: design
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Implementation plan

## Tasks

- TASK-001 [REQ-003, REQ-004, REQ-005, REQ-006, REQ-009, AC-003, AC-004, AC-005] Add store-owned parameterized read models and query-service cursor DTOs for overview, Sessions, event summaries/details, filters, and type statistics; protect with seeded database tests.
- TASK-002 [depends: TASK-001] [REQ-001, REQ-002, REQ-003, REQ-004, REQ-005, REQ-006, REQ-009, AC-001, AC-002, AC-003, AC-004, AC-005] Implement loopback HTTP lifecycle, token/Host/method/security middleware, bounded JSON routing, error mapping, and CLI option delegation.
- TASK-003 [depends: TASK-001, TASK-002] [REQ-007, AC-006] Implement authenticated bounded SSE polling with cursors, heartbeats, cancellation, and shutdown cleanup.
- TASK-004 [depends: TASK-002, TASK-003] [REQ-008, AC-007] Add bundled dependency-free UI assets for token bootstrap, overview, Sessions, timeline/filtering, lazy event JSON, and authenticated streaming.
- TASK-005 [depends: TASK-004] [REQ-010, AC-008] Update README, architecture context, and Directory Map; verify compatibility and isolated real service behavior.

## Verification

- VER-001 [AC-003, AC-004, AC-005] Run focused store/query tests with multiple Sessions, duplicate timestamps, cursor boundaries, filter combinations, exact details, and aggregate values.
- VER-002 [AC-001, AC-002] Run HTTP/CLI tests against an ephemeral loopback port for options, headers, auth, Host, methods, routes, and shutdown.
- VER-003 [AC-006] Run an authenticated streaming test that appends after connection, parses one SSE event/cursor, aborts, and confirms cleanup.
- VER-004 [AC-007] Assert static HTML contains required surfaces/security bootstrap and contains no external resource URL.
- VER-005 [AC-008] Run `npm test`, `npm run typecheck`, shell checks, `git diff --check`, `pi -ne -e . --list-models`, and an isolated curl-based Server smoke test.

## Architecture and recovery

- HTTP routes consume only `TraceQueryService`; they never receive `TraceStore` or collector/config mutation capabilities.
- Full payload is isolated to detail lookup; list/stream DTOs remain lightweight.
- All SQL value inputs are bound parameters; only closed enum/sort fragments may shape SQL text.
- Server owns and closes timers, sockets, query handles, and signal handlers.
- No schema changes mean rollback is source-only and does not alter existing Trace data.

## Implementation result

- TASK-001 completed: `TraceStore` owns parameterized overview/type/session/event/detail SQL; `TraceQueryService` owns opaque deterministic cursors and Web-safe pages.
- TASK-002 completed: `server.ts` provides loopback-only HTTP, ephemeral Bearer auth, Host/method gates, strict headers, bounded routes and CLI lifecycle delegation.
- TASK-003 completed: authenticated SSE polls bounded summary pages, emits resumable cursor IDs/heartbeats, and disposes timers/responses on disconnect or shutdown.
- TASK-004 completed: `web.ts` bundles same-origin HTML/CSS/JS for overview, storage distribution, Session pages, filtered timeline, lazy details and authenticated live fetch with a persistent sensitivity warning.
- TASK-005 completed: README, architecture context and Directory Map describe the implemented read-only boundary.

## Verification evidence

- VER-001: query tests cover multi-Session ordering, duplicate-timestamp event cursors, filtering, payload exclusion, exact detail, missing detail, aggregates, and malformed cursors.
- VER-002: HTTP/CLI tests cover ephemeral ports, CLI delegation/opening, loopback rejection, Host rejection, Bearer enforcement, 405/404/400 behavior, CSP/no-store/no-CORS headers, and graceful close.
- VER-003: streaming test authenticates, appends after connection, receives a bounded `turn_start` SSE summary, aborts, and closes the Server.
- VER-004: static integration checks verify sensitivity warning, fragment-to-sessionStorage token bootstrap, live endpoint use, and absence of external HTTP assets.
- VER-005: `npm test` passed 10 files / 37 tests; `npm run typecheck`, shell syntax checks, `git diff --check`, and `pi -ne -e . --list-models` passed.
- Isolated curl smoke test started `qb-trace server --port 0`, loaded the local UI, authenticated status and Session APIs against one seeded event, then shut down through SIGTERM without error.

## Acceptance result

- AC-001 through AC-008: PASS. No blocked or unverified acceptance remains.
