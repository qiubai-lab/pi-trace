---
id: QB-20260910-local-trace-web
type: design
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Local read-only Trace Web service

## Goal

Provide a secure, bounded, local personal Web service and browser UI for inspecting QB Trace status, sessions, timelines, event payloads, storage distribution, and live events without affecting collection or exposing writable operations.

## Scope

- Implement `qb-trace server` with loopback-only host/port options, optional browser opening, graceful shutdown, and clear startup/database errors.
- Generate an ephemeral access token and require Bearer authentication for all Trace APIs and live streams.
- Add read-only health, status, event-type statistics, paginated Session/Event, event-detail, and SSE endpoints.
- Add a dependency-free local UI for overview, Session navigation, event filtering/timeline, lazy payload inspection, and live updates.
- Keep all list responses bounded and parameterized; keep full payload out of list DTOs.

## Non-goals

- LAN/remote serving, persistent accounts, multi-user authorization, CORS, or third-party assets.
- Web recording controls, prune, deletion, or other database/config writes.
- Full-database payload text search, automatic retention, export/upload, or daemon management.
- Database schema migration or materialized summary tables.

## Foundation decision

- Runtime: Node.js built-in `node:http`; no new runtime framework or frontend build system.
- Boundaries: CLI parses Server options; `server.ts` owns HTTP lifecycle/security/routing; `web.ts` owns static presentation assets; `query.ts` exposes Web-safe read models; `store.ts` remains the only SQLite implementation owner.
- Security: loopback bind only, strict Host validation, no CORS, Bearer token, CSP, `Cache-Control: no-store`, no external resources, no token in HTTP request logs. Startup URL carries the token only in its fragment; UI moves it into session storage.
- Performance: cursor pagination, hard page limits, lightweight event rows, one-event detail fetch, bounded SSE batches/backpressure, and no long-lived SQLite transaction.
- Compatibility: schema 1 and existing collector/CLI behavior remain unchanged.
- User authorization: localhost-only personal read-only scope explicitly approved on 2026-09-10.

## Requirements

- REQ-001: `qb-trace server` shall default to loopback, support validated loopback host/port and `--open`, print a fragment-token URL, reject non-loopback hosts, report bind/schema errors, and shut down cleanly on SIGINT/SIGTERM.
- REQ-002: Every `/api/v1/*` endpoint and event stream shall require the ephemeral Bearer token, reject invalid Host/method/auth, omit CORS, set no-store and strict browser security headers, and expose no writable route.
- REQ-003: Health/status APIs shall report Server/database/schema health plus recording, event count, payload/storage size, diagnostics, and earliest/latest event time without mutating storage.
- REQ-004: Session and event-list APIs shall use validated cursor pagination and hard limits; support relevant metadata/time/type/run/turn/tool/model/provider filters; and exclude `payload_json` from list results.
- REQ-005: Event detail shall retrieve exactly one event by ID and expose its full normalized payload only after explicit selection.
- REQ-006: Event-type statistics shall report event count and payload bytes for storage analysis.
- REQ-007: An authenticated SSE endpoint shall emit bounded new-event summaries, resumable cursor IDs, heartbeats, and close promptly with the client or Server.
- REQ-008: The local UI shall provide overview cards/distribution, Session pagination, a filterable timeline with correlation metadata, lazy JSON detail, live updates, loading/empty/error states, and a persistent warning that Trace data is unredacted and sensitive.
- REQ-009: Query/HTTP memory and response size shall not scale with the entire database: list limit defaults to 50 and is capped at 200; invalid cursors/filters return 400; transient SQLite busy/unavailable conditions return bounded errors rather than crashing collection or Server.
- REQ-010: Existing on/off/status/prune, collection, schema 1, permissions, and package discovery shall remain compatible.

## Acceptance criteria

- AC-001 [REQ-001]: Server command option/lifecycle tests prove loopback defaults, non-loopback/invalid-port rejection, startup URL/token behavior, browser-open delegation, and graceful close.
- AC-002 [REQ-002]: HTTP tests prove Host, method, and Bearer enforcement; absence of CORS/write routes; and presence of CSP/no-store headers without token leakage.
- AC-003 [REQ-003, REQ-006]: Seeded-database API tests return correct health/status/diagnostics/time/storage and event-type aggregates.
- AC-004 [REQ-004, REQ-009]: Seeded multi-Session tests prove deterministic cursors, limit cap, filters, 400 handling, and absence of payload from list DTOs.
- AC-005 [REQ-005]: Detail API returns one exact full payload and 404 for an unknown event.
- AC-006 [REQ-007]: Stream test authenticates, receives a new bounded event and cursor/heartbeat semantics, then disconnects without leaked polling work.
- AC-007 [REQ-008]: Static UI integration checks confirm overview, Session/timeline/detail/live controls, sensitive-data warning, token-fragment handling, and no external assets.
- AC-008 [REQ-010]: Full tests, typecheck, shell checks, package discovery, and an isolated real HTTP smoke test pass with schema 1 and existing CLI behavior.

## Behavior Delta

### ADDED

- REQ-001: `qb-trace server` starts a real local read-only service instead of returning the reserved-command error.
- REQ-003: Local clients can inspect Trace health and storage/session summaries.
- REQ-004: Local clients can page and filter lightweight Trace events.
- REQ-005: Local clients can explicitly load a full event payload.
- REQ-007: Local clients can follow new Trace events in real time.
- REQ-008: A bundled local browser UI presents the read-only data.

## Risks and recovery

- Trace payloads are highly sensitive. Loopback, token authentication, strict browser headers, and no external resources are mandatory, not optional enhancements.
- Schema 1 lacks materialized summaries, so aggregate endpoints scan indexes/tables. Responses remain bounded and future schema optimization is deferred until measured.
- Vacuum/prune can temporarily make queries busy; requests return retryable bounded errors and never hold long transactions.
- Rollback restores the reserved `server` command and removes HTTP/UI modules; no data migration is required.
