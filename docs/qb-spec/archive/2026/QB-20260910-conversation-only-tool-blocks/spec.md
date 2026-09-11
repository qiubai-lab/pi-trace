---
id: QB-20260910-conversation-only-tool-blocks
type: feature
tier: standard
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Conversation-only Session canvas with merged tool blocks

## Goal

Make the Session canvas a single, intuitive Conversation experience and represent one logical tool invocation as one evolving block instead of separate call/start/result cards.

## Scope

- Remove Timeline and Raw view controls and event-type filtering from the Session canvas.
- Render Conversation as the only maintained primary Session view while retaining lightweight Event inspection and Live refresh.
- Correlate recorded tool-call, execution-start and result fragments by `toolCallId`.
- Display one tool block with tool name, status, input and result/error sections.
- Merge tool fragments both within an API page and across client-loaded pages, preserving chronological placement and a useful source Event link.
- Refine Conversation spacing and tool-block hierarchy for straightforward top-to-bottom reading.

## Non-goals

- Removing the existing read-only timeline/raw HTTP APIs, which remain compatible diagnostic boundaries.
- Changing Trace capture or storage schema.
- Fabricating missing inputs/results or treating different tool-call IDs as the same invocation.
- Rich per-tool renderers, Markdown rendering or writable controls.

## Requirements

- REQ-001: The Session canvas shall expose only Conversation; Timeline, Raw and event-type filter controls shall not be visible or represented in workspace URL state.
- REQ-002: All fragments with the same recorded `toolCallId` shall collapse into exactly one Conversation item, including fragments split across cursor pages.
- REQ-003: A merged tool item shall visibly distinguish tool name, pending/completed/error status, input and result when recorded, without duplicating identical input from call/start Events.
- REQ-004: The merged tool item shall retain the earliest invocation position while linking to the most useful available source Event, preferring a result Event once present.
- REQ-005: Conversation chronology, virtualization, bounded previews, forward paging, URL Session/Event restoration, live invalidation and read-only security shall remain intact.

## Acceptance criteria

- AC-001 [REQ-001]: Component and production-browser evidence show no Timeline, Raw or event-type filter controls, and Session URLs no longer emit `view` or `type` state.
- AC-002 [REQ-002, REQ-004]: Projection tests combine message tool-call, execution-start and tool-result fragments into one stable `tool:<toolCallId>` item with earliest timestamp and result Event source link; client tests merge the same item across pages.
- AC-003 [REQ-003]: The merged block visibly shows one header/status plus non-duplicated Input and Result sections; errors have an explicit error status.
- AC-004 [REQ-005]: Production-browser evidence on the reported Session shows one block per tool invocation in chronological Conversation order and a bounded virtual DOM; selecting it opens Event detail.
- AC-005 [REQ-005]: Full tests, typecheck, production build, API/security regressions and benchmark pass.

## Behavior Delta

### REMOVED

- REQ-001: Timeline and Raw are removed as Web display modes.
- REQ-002: Event-type filtering is removed from the Conversation-only canvas.

### MODIFIED

- REQ-003: Tool call/start/result cards become one correlated tool invocation block.
- REQ-004: Workspace URL state is reduced to Session and selected Event.

## Implementation steps

- [x] Add failing projection/component regressions for same-page and cross-page tool-fragment merging.
- [x] Extend Conversation DTO/projection with merged tool status/input/result semantics and source preference.
- [x] Simplify workspace state and Session canvas to Conversation-only navigation.
- [x] Redesign tool blocks and remove obsolete Timeline frontend code.
- [x] Run focused/full automation and production-browser acceptance on the reported Session.

## Risks and recovery

- Interrupted calls may never have a result; they remain one pending block with the recorded input.
- Missing `toolCallId` values cannot be safely correlated and remain separate source-derived blocks.
- Page boundaries require client-side re-merging by stable item ID; tests cover later result fragments updating an earlier call.
- HTTP timeline/raw endpoints remain available for compatibility and low-level diagnostics even though the Web UI no longer presents them.
- Source rollback restores the former view selector without data migration.

## Verification evidence

- AC-001: App/workspace-state tests and Chromium show Conversation as the sole Session view; Timeline, Raw and filter controls are absent, and URLs emit only Session/Event state.
- AC-002: Projection tests merge call/start/result fragments into stable `tool:<toolCallId>` items; the Conversation component test verifies cross-page merging and preferred Result Event linking.
- AC-003: Component tests and Chromium show one tool header with pending/completed/error status plus non-duplicated Input and Result sections.
- AC-004: On Session `01a08b84-9847-7085-b8ed-1aa7d3cd3d19`, Chromium showed 27 chronological API items with 11 virtualized DOM cards; selecting a merged `bash` block opened its `tool_result` Event and retained selection with Live active.
- AC-005: `npm test` passed 16 files/54 tests; `npm run typecheck`, `npm run build:web`, `npm run benchmark:web`, `npm audit --omit=dev`, `bash -n bin/qb-trace`, and `pi -ne -e .` passed. Benchmark: summary 177.7 ms, timeline page 3.6 ms, Conversation source page 13.2 ms.

## Authorization

The user explicitly requested a Conversation-only display and one block per tool invocation on 2026-09-10.
