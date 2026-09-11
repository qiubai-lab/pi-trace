---
id: QB-20260910-complete-conversation
type: feature
tier: standard
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Complete chronological Conversation projection

## Goal

Make Conversation a faithful, readable, start-to-finish view of the recorded Session instead of showing only the final answer when recent raw Event pages are dominated by streaming updates.

## Scope

- Page Conversation source Events chronologically from oldest to newest.
- Fetch only Event types that contribute durable conversation meaning rather than spending pages on streaming deltas.
- Project user prompts, system prompts, assistant thinking, assistant responses, tool calls, tool results and shell input as explicit source-linked items.
- Preserve the order of multiple content blocks emitted by one recorded message.
- Update Conversation labels, forward pagination and visual roles for the expanded content.

## Non-goals

- Reconstruct content that was not recorded or merge separate Events by inference.
- Display every streaming token/update Event.
- Markdown rendering, syntax highlighting or a detailed Event-type renderer.
- Capture/schema/security changes.

## Requirements

- REQ-001: Conversation queries shall use stable oldest-first cursor pagination and shall not omit or duplicate equal-timestamp source Events across pages.
- REQ-002: Conversation source paging shall exclude non-semantic streaming/status noise while retaining recorded `before_agent_start`, completed messages, tool results and shell input needed for the requested view.
- REQ-003: Projection shall emit explicit ordered items for user prompts, system prompts, assistant thinking, assistant response text, assistant tool-call blocks, tool results and shell commands when those values exist in recorded payloads.
- REQ-004: Every projected item shall retain a unique item identity and its source Event identity so multiple blocks from one message render independently and still open the correct Event detail.
- REQ-005: Conversation shall remain bounded, virtualized, payload-preview-limited, token-safe and read-only; subsequent pages shall continue toward later context.

## Acceptance criteria

- AC-001 [REQ-001, REQ-002]: Query tests with noisy streaming updates and equal timestamps prove the first and next Conversation pages are meaningful, oldest-first and non-overlapping.
- AC-002 [REQ-003, REQ-004]: Projection tests prove one recorded flow yields System prompt → User prompt → Thinking → Tool call → Tool result → Assistant response items, with stable unique item IDs and source links.
- AC-003 [REQ-005]: Component tests prove multiple blocks from one Event render separately and select the same source Event; forward pagination wording is accurate.
- AC-004 [REQ-001..REQ-005]: Production-browser evidence on the reported Session shows early prompt/thinking/tool context above the final response and a bounded virtual DOM.
- AC-005 [REQ-005]: Full tests, typecheck, production build and security/API regressions pass.

## Behavior Delta

### MODIFIED

- REQ-001: Conversation paging changes from newest-first raw pages plus client sorting to meaningful oldest-first pages.
- REQ-002: Conversation expands from one item per selected Event to ordered semantic blocks covering prompts, thinking, tool calls/results and responses.
- REQ-003: Conversation item identity is separated from source Event identity.

## Implementation steps

- [x] Add failing projection and query regressions for semantic block expansion and chronological noise-resistant paging.
- [x] Extend internal query filtering/paging for bounded oldest-first Conversation source Events.
- [x] Expand Conversation DTO/projection to unique source-linked semantic items without fabricating absent content.
- [x] Update the virtualized Conversation UI, role styling and forward pagination copy.
- [x] Run focused/full automation and production-browser acceptance on the reported Session.

## Verification evidence

- AC-001/AC-002: Projection and query regressions cover semantic block expansion, unique item/source identities, oldest-first equal-timestamp cursors and immunity to 25 intervening `message_update` Events.
- AC-003: `Conversation.test.tsx` renders multiple blocks from one source Event, verifies both select that Event and confirms forward pagination copy.
- AC-004: BetterWright production Chromium opened the reported `/root/projects/test` Session. Its Conversation visibly starts at 9:32:28 PM with System prompt/User prompt/Assistant response and continues through later User prompt, Thinking, Tool call/start/result in timestamp order instead of showing only the final answer.
- Source-link browser evidence: Clicking sibling Thinking and Tool-call blocks opened the same `message_end` Event. The API returned all 61 meaningful items in one bounded page while only 21 cards were present in the virtual DOM.
- AC-005: `npm test` passed 16 files/53 tests; `npm run typecheck`, shell syntax checks and `pi -ne -e .` passed; `npm audit --omit=dev` reported 0 vulnerabilities.
- Benchmark: 100,000-event Session summary 146.5 ms, timeline page (200) 2.1 ms, semantic Conversation source page (200) 7.6 ms.
- BetterWright checklist `Complete chronological Conversation acceptance` was audited with all three requirements proven. Evidence is retained under `/root/.betterwright/artifacts/85b42e1702877c85/`.

## Risks and recovery

- System prompts and tool results can be large and sensitive; existing preview truncation and explicit Event detail loading remain mandatory.
- Prompt/message duplication is avoided by treating completed user messages as the user prompt and using `before_agent_start` only for separately recorded system-prompt context.
- Streaming deltas are intentionally excluded because completed message Events contain the durable accumulated thinking/text; Raw and Timeline retain every update.
- Source rollback restores the previous projection without changing stored data.

## Authorization

The user explicitly requested complete chronological Conversation content including prompts, thinking and tool calls on 2026-09-10.
