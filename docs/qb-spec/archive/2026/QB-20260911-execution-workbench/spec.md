---
id: QB-20260911-execution-workbench
type: design
tier: strict
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---
# Agent execution workbench

## Authorization and scope
User accepted the preceding execution-workbench proposal and requested implementation of all four stages. Preserve raw schema-1 history, recording/prune CLI behavior, loopback authentication and callback-visible payload retention. No Pi core patching, arbitrary local artifact reads, remote resources or tool re-execution. Current UI/architecture context applies except the explicitly approved replacement of conversation-only navigation with execution/conversation/event views and a nonmodal inspector, plus the approved Worker/application-query and derived-cache ownership described in the paired plan. src/store remains the exclusive owner of authoritative raw writes; src/storage owns only disposable execution-index writes.

## Requirements
- REQ-001: Reconstruct operations, independent message blocks, lifecycle boundaries, explicit parent links and source-event provenance; unknown/incomplete observations are not fabricated successes. Numeric runtime ordering and operation-level failure counts are correct.
- REQ-002: Provide execution hierarchy/time waterfall, global activity overview, bounded search/window navigation, event view, conversation view and independently addressable inspector. Selection survives viewport eviction and view changes.
- REQ-003: Type-aware content: message Markdown, tool args/results, edit blocks, recorded image attachments, context differences, metadata and bounded raw text. Remote Markdown images and automatic local path reads are forbidden; sensitive fields masked by default in presentation only.
- REQ-004: Live updates use resumable committed-ingestion cursors, reconnect and maintain user location; replay has step/time/speed/skip-idle controls, only exposes evidence at the selected cutoff and never performs tool calls.
- REQ-005: Add opt-in namespaced span/artifact instrumentation and recorded tool/skill provenance. Reading a skill is not represented as proof of executing it. Public hooks cannot measure every plugin handler; UI/docs state limits.
- REQ-006: Isolate SQLite writes from Agent event loop, keep synchronous observation snapshots, bounded queue/retry/shutdown and fail-open diagnostics. Derive searchable metadata outside UI/HTTP, with rebuildable versioned index; no destructive raw migration.
- REQ-007: Readable dense desktop layout, resizable/keyboard-operable inspector, focused execution animations and reduced-motion/transparency/contrast fallbacks. Bounded DOM and payload responses on large traces.

## Acceptance
- AC-001 [REQ-001]: automated mixed-message, parallel-tool, repeated error, missing-end and equal-timestamp tests pass; each projected block and operation resolves to its actual evidence.
- AC-002 [REQ-002]: component and browser checks exercise all views, filters, target deep link outside first page, inspector selection and bounded paging.
- AC-003 [REQ-003]: tests cover typed tool input/result, edit blocks, content blocks, image safety, masked secrets, bounded raw slices and context comparison.
- AC-004 [REQ-004]: committed cursor/reconnect tests plus browser Live/replay checks prove no future results or tool execution; paused analysis remains stable.
- AC-005 [REQ-005]: instrumentation validation/namespace/parent tests and example integration prove opt-in spans; documentation explains skill attribution and host gaps.
- AC-006 [REQ-006]: worker integration and collector failures/disabled-mode/shutdown tests; raw schema compatibility and index rebuild after prune; existing server security/CLI regressions pass.
- AC-007 [REQ-007]: full typecheck/build/tests, large trace benchmark, browser keyboard/resize/narrow/reduced-motion checks; no full-payload formatting on interaction thread.

## Behavior Delta
### ADDED
- REQ-001, REQ-005: Evidence-backed operations/content blocks and cooperative spans/artifacts.
- REQ-002, REQ-004: Execution/event views, search, target windows, history playback and resumable Live.
### MODIFIED
- REQ-003: Typed independent inspector replaces single-event generic modal reading.
- REQ-006: Worker writing and derived indices replace synchronous raw-payload-dependent hot queries; original history stays readable.
- REQ-007: Stable hierarchy and waterfall replace arbitrary alternating cards and decorative pan.
### REMOVED
- REQ-002: Conversation-only work area and DOM-anchor-dependent modal navigation are removed. Legacy raw v1 APIs remain available; old event deep links remain supported.

## Risks and recovery
Derived database is disposable, versioned and isolated from authoritative traces.sqlite. Index recreation must follow pruning/replacement; collector does not depend on Web/index. Worker failures must surface gaps rather than block Pi. Replay uses recorded observation time, not an invented global causal order. Cross-runtime wall clocks are approximate. Raw secrets remain present on disk by contract; UI masking is not redaction. Public hook lifecycle includes preflight and middleware and is not pure execution duration. Cross-run comparison is a subsequent enhancement, not one of the four accepted delivery stages.

## Independent specification review
PASS WITH NOTES. Reviewed requirements against accepted proposal and current source separately from implementation planning. AC-001..007 close all requirements/Delta entries. Notes: do not claim passive hooks observe all handler internals; benchmark budgets are measured evidence, not guarantees on unspecified hardware. Rebuildable sidecar is chosen to avoid irreversible migration. No blocking clarification.

## Delivery evidence and refinements
AC-001..007 are covered by VER-001..007 in the paired plan and `docs/verification-execution-workbench.md` (repository-relative). All four requested stages are implemented. Final full regression: 19 files / 69 tests PASS; typecheck/build, shell syntax and diff checks PASS. Real Pi RPC initialization/shutdown records schema-1 events without storage errors/drops. Browser checklist is ready and audited.

Live uses Session-scoped committed-ingestion **invalidation watermarks**, not a claim of delivering every event as an SSE frame. Re-querying updates a bounded stable-ID window; initial connection and unrelated Sessions do not imply new local records. Replay permits only forward-safe previous snapshots while a newer time is rebuilding, labels that pending state, and does not reuse future results on rewind. History caches are short-lived and playback respects query backpressure.

Index, search and read-formatting work are off the UI/Agent thread; synchronous observation snapshots still incur measurable cost. Worker production files are bundled .mjs rather than relying on TypeScript stripping under node_modules. Sidecar synchronization re-reads durable reducer checkpoints under a write lock for multiple cooperating readers. Inspector previews are bounded; source events/Raw remain reachable.

No mandatory acceptance remains blocked. Measurements and platform limits are recorded explicitly: browser functional checks use the smaller synthetic fixture; the 100k+ test is a query benchmark, not a browser FPS/SLA claim; actual runtime validation was Node 24/Linux/Chromium, not an unverified Node 22 or cross-platform matrix. No new long-lived style/context policy was inferred or promoted automatically.
