---
id: QB-20260910-session-workbench
type: design
tier: strict
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# React Session analysis workbench

## Goal

Replace the prototype Trace page with a desktop-first React analysis workbench that lets a user understand one Session through a structured execution timeline and a human-readable conversation view, while establishing boundaries that can support later analytical components and large local datasets.

## Scope

- Introduce a bundled React/TypeScript frontend and reproducible frontend build.
- Make Session navigation the primary workflow.
- Provide a resizable IDE/debugger-style workspace with Session summary, structured timeline, conversation view, and event detail.
- Add read-only query projections and API endpoints needed by the two Session views.
- Design for 100,000 events in one Session and millions of events in the database through bounded server queries, cursor pagination, virtualization, and lazy payload access.
- Preserve live updates, filters, deep-linkable selection, sensitive-data messaging, and existing local security boundaries.
- Apply the repository `apple-design` skill as implementation guidance for hierarchy, typography, immediate feedback, spatial consistency, restrained material, accessibility, reduced motion, and interruptible panel interactions.

## Non-goals

- Cross-Session full-text search or a global Event Explorer.
- Trend dashboards, token/cost analysis, duration analysis, or other advanced metrics.
- Web recording controls, prune, deletion, annotation, or any other mutation.
- LAN/remote access, CORS, persistent accounts, or multi-user authorization.
- Mobile-specific workflows; narrow screens only require a safe, understandable fallback.
- Changing the captured Trace envelope or inventing conversation content absent from recorded events.
- A generic plugin system, event bus, separate frontend service, or materialized analytics store.

## Assumptions and constraints

- The workbench targets a modern desktop browser on the same trusted machine as the loopback Server.
- Trace payloads remain unredacted and sensitive; conversation projections and previews inherit that classification.
- Existing `/api/v1` endpoints remain compatible. New endpoints are additive.
- SQLite remains authoritative, and `src/store.ts` remains the only SQLite implementation owner.
- The Server remains optional and cannot become a dependency of collection, recording control, pruning, or schema writes.
- Performance checks use a generated 100,000-event Session fixture; wall-clock budgets are reported as evidence rather than treated as portable guarantees across all hardware.

## Foundation decision

### Target structure and module contracts

- `src/server/`: loopback HTTP composition, authentication, security headers, route dispatch, static asset delivery, and SSE lifecycle. It may call public query/application contracts but may not access SQLite directly.
- `src/analysis/`: framework-independent Session summary, timeline grouping, and conversation projection rules. It owns projection semantics and can be tested without React or HTTP.
- `src/query.ts` and `src/store.ts`: cursor/query boundary and SQLite ownership. New grouped queries stay bounded and indexed; API and UI models do not leak storage rows.
- `src/web/`: React application, feature modules, API/SSE adapters, design tokens, and bounded presentation state. It has no storage or mutation capability.
- A generated frontend bundle is served same-origin by the package. No CDN, third-party script, remote font, or separate development server is required at runtime.
- Cross-boundary data uses explicit TypeScript DTOs with one canonical definition. Dependency direction is `web/server adapters -> application projections/query contracts -> store`, never the reverse.

### Frontend engineering decision

- Use React 19, TypeScript, and Vite.
- Use TanStack Query for remote state and cache ownership, TanStack Virtual for long lists, and a focused resizable-panel component rather than a general UI framework.
- Keep selected Session, view, filters, and selected Event in the URL; keep ephemeral panel/collapse state local. Do not add a global state library without a demonstrated cross-feature need.
- Organize by capability: `sessions`, `session-overview`, `timeline`, `conversation`, and `event-detail`; only proven cross-feature primitives belong in `ui` or `api`.
- Treat motion as feedback and spatial explanation, not decoration. Panel resizing tracks the pointer directly; ordinary state transitions are short and critically damped/no-overshoot. Reduced-motion, reduced-transparency, keyboard focus, contrast, and text scaling are first-class behavior.

### Server and API decision

- Preserve current status, Session list, raw event list/detail, event statistics, and SSE APIs.
- Add bounded Session summary, structured timeline, and conversation projection endpoints under `/api/v1/sessions/:sessionId/`.
- Hierarchy is `Agent Run -> Turn -> Event`; events without a run or turn remain visible at the nearest valid Session/run level.
- Conversation rows are derived only from recorded message/tool events, identify their source Event, use a bounded preview/response byte budget, and defer complete payload access to event detail.
- Invalid filters/cursors remain 400 responses; unknown resources remain 404; busy storage remains a bounded retryable error.

### Migration and recovery

- Establish contract and characterization tests before replacing the prototype UI.
- Add projections and APIs without removing existing endpoints, then switch static serving to the built React assets.
- Keep each migration slice buildable and testable. A source-level rollback restores the previous static assets and removes additive endpoints; no destructive data migration is planned.
- Any additive index or schema adjustment must be versioned, compatibility-tested, and independently reversible; it is introduced only when query evidence shows it is necessary.

### Stable fact sources

- Current change requirements and acceptance: this document and its strict plan.
- Long-lived architecture: `docs/qb-spec/context/ARCHITECTURE_SPEC.md` after separate explicit context promotion.
- Repository structure: `docs/qb-spec/DIRECTORY_MAP.md` after implementation reflects reality.
- Executable dependency versions and commands: `package.json`, lockfile, Vite config, and TypeScript configs.

## Requirements

- REQ-001: The Web UI shall be a bundled same-origin React application with explicit feature boundaries, reproducible non-interactive build/typecheck/test commands, and no external runtime assets.
- REQ-002: The primary workspace shall provide a desktop IDE/debugger layout with Session navigation, a central analysis surface, and Event detail in resizable regions; selection and filters shall remain understandable during resizing and refresh.
- REQ-003: Selecting a Session shall show a bounded summary including time range, event/payload counts, Agent Run/Turn/tool/error counts, provider/model context when present, and clear loading, empty, unavailable, and retry states.
- REQ-004: The default timeline shall present recorded data as `Agent Run -> Turn -> Event`, support collapse and raw-event fallback, preserve events lacking correlation fields, and expose event type, time, error, payload size, and correlation cues without loading full payloads.
- REQ-005: A conversation view shall present recorded user/assistant/message/tool context in chronological order, link every projected item to source Events, show unrecognized or unavailable content honestly, and allow switching to the same context in the structured/raw timeline without fabricating data.
- REQ-006: Timeline and conversation views shall share Session, filter, selected Event, and live state; the URL shall restore the selected Session, view, supported filters, and Event detail after refresh or link sharing without exposing the Bearer token.
- REQ-007: Event detail shall load only after explicit selection, present metadata and correlated identifiers separately from payload, provide structured and raw JSON modes, and handle malformed or large payloads without losing access to the stored text.
- REQ-008: For a 100,000-event Session, APIs shall remain cursor-bounded with at most 200 rows per page; the browser shall not fetch the complete Session or render DOM proportional to total events; filtering, grouping, conversation projection, live merge, and payload access shall remain incremental.
- REQ-009: Live mode shall append or invalidate only affected bounded data, preserve the user's scroll/selection where possible, indicate paused/disconnected/error states, and release streams and timers when Session/view ownership ends.
- REQ-010: Visual and interaction implementation shall follow `apple-design`: immediate press/focus feedback, stable spatial mapping, restrained hierarchy/materials, system typography, purposeful motion, interruptible direct manipulation, and equivalent feedback under reduced motion/transparency and increased contrast preferences.
- REQ-011: Existing loopback binding, Host validation, ephemeral Bearer authentication, fragment-to-session-storage token handling, CSP/no-store/no-CORS policy, read-only routes, lazy full-payload boundary, and sensitive-data warning shall remain enforced.
- REQ-012: Existing collection, recording, status, prune, CLI Server lifecycle, Trace schema compatibility, raw `/api/v1` clients, and package discovery shall remain operational and independent of the React application.

## Acceptance criteria

- AC-001 [REQ-001]: A clean dependency install can run the frontend production build, application tests, frontend typecheck, package typecheck, and package tests non-interactively; the produced page makes no external asset request.
- AC-002 [REQ-002, REQ-006]: A browser integration test selects a Session, switches views, selects an Event, resizes panels, refreshes the URL, and restores the same safe workspace state without placing the token in the query/path.
- AC-003 [REQ-003]: Seeded Session summary tests prove all available aggregate/context fields plus explicit loading, empty, unavailable, and retry presentation.
- AC-004 [REQ-004]: Projection and UI tests prove run/turn grouping, deterministic order, collapse behavior, raw fallback, missing-correlation placement, error cues, and absence of full payload in timeline rows.
- AC-005 [REQ-005]: Mixed message/tool/unknown fixtures prove chronological conversation projection, source links, honest fallback behavior, bounded previews, and navigation to the corresponding timeline Event.
- AC-006 [REQ-007]: Detail tests prove lazy one-Event fetch, metadata separation, structured/raw switching, malformed JSON fallback, and accessible handling of a generated large payload without altering its stored text.
- AC-007 [REQ-008]: A generated 100,000-event Session test proves endpoint page caps and deterministic cursors; frontend tests prove virtualized rendering remains bounded and no request attempts to load the complete Session. Query timing and query-plan evidence are recorded for the fixture.
- AC-008 [REQ-009]: SSE tests prove bounded incremental updates, stable selection behavior, visible disconnect/retry state, and cleanup after Session switch, component unmount, abort, and Server close.
- AC-009 [REQ-010]: Keyboard-only checks cover workspace navigation, view switching, disclosure controls, filters, and detail modes; automated checks cover labels/focus/contrast-sensitive states and all three relevant media preferences; reduced motion removes spatial motion without removing status feedback.
- AC-010 [REQ-011]: Security regression tests prove Host/method/token enforcement, CSP/no-store/no-CORS, same-origin assets, persistent sensitive-data warning, no writable API, and no payload in bounded timeline/session list DTOs.
- AC-011 [REQ-012]: Existing server/query/CLI/collector tests, package typecheck, shell syntax checks, package discovery, and an isolated HTTP smoke test pass; old raw API endpoints retain compatible response semantics.

## Behavior Delta

### ADDED

- REQ-001: The package gains a reproducibly built React frontend instead of only handwritten string assets.
- REQ-003: A selected Session gains a dedicated operational summary.
- REQ-004: Session events gain a structured run/turn timeline while preserving a raw path.
- REQ-005: Recorded messages and tools gain a source-linked conversation projection.
- REQ-006: Workspace state becomes deep-linkable independently of authentication state.
- REQ-010: The Web UI gains explicit accessibility and motion/material behavior guided by `apple-design`.

### MODIFIED

- REQ-002: The fixed prototype columns are replaced by an intentional, resizable analysis workspace.
- REQ-008: Browser-side append rendering is replaced by bounded virtualized presentation and server-owned projection work suitable for 100,000-event Sessions.
- REQ-009: Live updates change from unconditional prepend behavior to bounded ownership-aware cache updates.

## Risks and recovery

- Conversation semantics can become misleading if payload shapes are guessed. Projection rules must be fixture-driven, source-linked, and explicit about unknown content.
- React/build dependencies increase package and release complexity. Runtime remains a static same-origin bundle, and clean-build/package checks guard missing assets.
- Large payload JSON parsing can block the main thread. Detail remains lazy, raw fallback is retained, and parsing/rendering work must be bounded or moved off the interaction path.
- Hierarchical pagination can duplicate or omit boundary Events if group cursors are unstable. Cursors require deterministic tie-breakers and cross-page tests.
- New aggregate SQL may regress concurrent collection. Queries remain read-only and bounded; query-plan evidence determines whether additive indexes are justified.
- Translucency and motion can reduce readability or comfort. Contrast and reduced-motion/transparency variants are required, and decoration is subordinate to analysis clarity.

## Open questions

None blocking. Exact package versions, preview byte limits, benchmark observations, and visual token values are implementation decisions constrained by the requirements above.

## Authorization

The user selected Session-first scope, a first delivery containing the usable workbench, hierarchical timeline plus context-oriented conversation view, a 100,000-event Session target, an IDE/debugger visual model, a full React stack, and explicitly requested on 2026-09-10 that this spec/plan be persisted and implementation begin using `apple-design` guidance.
