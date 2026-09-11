---
id: QB-20260910-draggable-conversation-popover
type: feature
tier: standard
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Draggable Conversation canvas and anchored Event popover

## Goal

Turn the Conversation area into a direct-manipulation vertical canvas and replace the persistent right Inspector with an Event-detail popover anchored to the Conversation item the user selected.

## Scope

- Keep Conversation as the sole Session analysis surface.
- Allow pointer users to grab available canvas space and pan the Conversation vertically while preserving wheel, scrollbar and keyboard scrolling.
- Remove the resizable right Inspector region and its separator.
- Open complete Event detail as a floating, source-anchored popover near the selected Conversation card.
- Keep Structured/Raw payload modes inside the popover, with bounded height and internal scrolling.
- Support close button, Escape, outside-click dismissal, focus placement/return and token-free Session/Event URL restoration.
- Preserve virtualization, forward paging, Live refresh, large-payload Worker formatting and accessibility preference fallbacks.

## Non-goals

- Free-form horizontal or zoomable infinite-canvas navigation.
- Moving, editing or reconnecting Conversation nodes.
- Changing Event APIs, capture, storage or payload contracts.
- Persisting popover geometry or canvas scroll position in the URL.

## Assumptions

- “可垂直向下拖动的画布” means direct pointer drag-to-scroll on non-interactive canvas space, with ordinary browser scrolling retained as the primary accessible fallback.
- “在会话对应的位置出现” means a floating detail surface spatially anchored to the clicked card, not an inline expansion or permanent side panel.

## Requirements

- REQ-001: The Conversation viewport shall support 1:1 vertical pointer panning from non-interactive canvas space without breaking wheel, scrollbar, keyboard scrolling, text selection or card activation.
- REQ-002: Selecting a Conversation item shall open one floating Event-detail popover adjacent to that source card; the permanent right Inspector and resize separator shall be removed.
- REQ-003: The popover shall expose recorded metadata, Structured/Raw payload modes and loading/error/retry states, and shall prefer a viewport-safe placement without obscuring its source more than necessary.
- REQ-004: The popover shall close through its close button, Escape or outside click, restore focus to its source card, and retain Session/Event state in the token-free URL while open.
- REQ-005: Virtualization, bounded Conversation loading, Live invalidation, selected-item source identity, large-payload formatting and reduced-motion/transparency/contrast behavior shall remain intact.

## Acceptance criteria

- AC-001 [REQ-001]: Component and Chromium checks show pointer dragging canvas whitespace changes `scrollTop` 1:1 while wheel/keyboard remain usable and clicking a card still opens detail.
- AC-002 [REQ-002]: Chromium shows no right-side Inspector or separator; clicking a card opens one visibly anchored popover near that card without resizing the Conversation canvas.
- AC-003 [REQ-003]: Component and Chromium checks cover metadata, Structured/Raw content, loading and error/retry states, and viewport-clamped internal scrolling.
- AC-004 [REQ-004]: Automated interaction checks cover close button, Escape, outside click, focus return and Session/Event URL updates with no Token exposure.
- AC-005 [REQ-005]: Existing Conversation projection/virtualization/Live tests, full tests, typecheck, production build and real-browser accessibility/performance checks pass.

## Behavior Delta

### ADDED

- REQ-001: Conversation gains direct vertical canvas panning in addition to standard scrolling.
- REQ-003: Event detail appears in a viewport-aware popover anchored to its source Conversation item.

### MODIFIED

- REQ-002: Event detail no longer occupies a persistent resizable right panel.
- REQ-004: Selected Event URL state now controls an anchored transient surface with explicit dismissal and focus restoration.

## Implementation steps

- [x] Add focused component regressions for canvas panning, anchored opening and dismissal/focus behavior.
- [x] Move Event-detail composition from the App panel split into the Conversation selection surface.
- [x] Implement viewport-aware anchored popover positioning and preserve payload modes/Worker formatting.
- [x] Implement pointer-captured vertical canvas panning with interaction guards and reduced-motion-safe feedback.
- [x] Redesign canvas/popover styling and remove obsolete inspector-panel/resizer code.
- [x] Run focused/full automation and Chromium acceptance on a real traced Session.

## Acceptance mapping

- AC-001: Conversation pointer interaction tests plus Chromium drag/scroll evidence.
- AC-002: App/Conversation tests plus anchored production screenshot and layout measurements.
- AC-003: EventDetail tests plus production Structured/Raw and constrained-height checks.
- AC-004: keyboard/outside-click/focus tests and token-free browser URL evidence.
- AC-005: existing regression suite, typecheck, build and bounded DOM inspection.

## Verification evidence

- `npm test`: 16 test files and 55 tests passed, including Conversation pointer interaction, popover dismissal/focus, EventDetail states and existing projection/Live regressions.
- `npm run typecheck`: Node and Web TypeScript checks passed.
- `npm run build:web`: production Vite build passed; CSS 14.02 kB and JS 297.57 kB.
- Chromium AC-001/002: a 200px upward pointer drag changed canvas `scrollTop` from 0 to 200; the 1440px canvas had no separator and opened one 416×576 anchored dialog without resizing.
- Chromium AC-003/004: Structured/Raw, 2030px internally scrollable payload content, Escape/outside dismissal, focus return, and token-free Session/Event URL behavior passed.
- Chromium AC-005: Live remained usable with the selected popover; TanStack Virtual rendered 11 positioned cards for a 10,585px scroll surface in a 678px viewport; accessibility media rules were present and their fallbacks remained covered by design tests.
- BetterWright evidence checklist `Draggable Conversation canvas and anchored popover acceptance`: AC1–AC4 proven and audited; proof artifacts are under `/root/.betterwright/artifacts/85b42e1702877c85/`.

## Risks and recovery

- Drag recognition can conflict with card clicks or text selection; start only from non-interactive canvas space and require a small movement threshold.
- Virtualized rows can unmount an anchor after large scrolling; dismiss the popover if its source leaves the rendered range rather than leaving an orphaned surface.
- Small viewports may not fit a side placement; clamp the popover within the viewport and fall back above/below the source with internal payload scrolling.
- Source rollback restores the prior side-panel composition without data migration.

## Authorization

The user explicitly requested the draggable Conversation canvas and source-position Event popup on 2026-09-10.
