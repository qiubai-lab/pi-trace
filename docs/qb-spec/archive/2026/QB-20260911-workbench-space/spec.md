---
id: QB-20260911-workbench-space
type: design
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# Execution Workbench Space

## Goal
Increase available reading space in the Inspector while retaining access to replay controls and execution navigation.

## Scope
- Make the historical replay control surface collapsed by default and reopenable from the footer status bar.
- Give the Inspector the released vertical space.
- Widen the Structure navigator and make each Agent run collapsible without changing its filtering behavior.
- Apply a consistent compact scrollbar treatment to scrollable workbench regions.

## Non-goals
- Do not change recorded data, execution grouping semantics, URL filter contracts, or replay behavior.

## Requirements
- REQ-001: The replay controls are hidden initially and can be toggled from the footer bar with an accessible, stateful button.
- REQ-002: When replay controls are hidden, the execution panels and Inspector receive the released vertical space; reopening restores playback controls.
- REQ-003: The Structure panel is wider and each Agent run can independently show or hide its child turns while preserving group filtering.
- REQ-004: Navigator, timeline, and Inspector use a shared visible but restrained scrollbar treatment.

## Behavior Delta
### MODIFIED
- REQ-001: Historical replay was permanently visible; it now starts collapsed and is explicitly expanded from the footer bar.
- REQ-003: Agent-run children were always shown; they can now be collapsed in the Structure panel.

## Acceptance
- AC-001 [REQ-001, REQ-002]: A loaded Session starts without visible replay controls; the footer control expands and collapses them, updating its accessible pressed state.
- AC-002 [REQ-003]: Structure width accommodates run labels, and activating an Agent run disclosure hides/shows only its associated turns; selecting a group remains available.
- AC-003 [REQ-004]: The three scrollable workbench panes present the shared scrollbar styling without changing overflow behavior.

## Implementation
- [ ] Extract replay visibility state into Workbench and provide a footer toggle to Playback/status chrome.
- [ ] Group navigator turns by Agent-run parent and add local disclosure state while preserving parent filter selection.
- [ ] Adjust grid and scroll styling for the space-focused desktop layout and responsive fallback.
- [ ] Add focused component/integration assertions and run typecheck, web build, and affected UI tests.

## Verification Mapping
- AC-001: App integration test and browser check of default collapsed/expanded replay state.
- AC-002: App integration test and browser check of Structure disclosure/filter behavior.
- AC-003: Browser check of visible scrollable panes; typecheck and web build.

## Authorization
The user request on 2026-09-11 explicitly authorizes this scoped work.

## Verification Evidence
- AC-001: `src/web/app/App.test.tsx` verifies the default collapsed state and footer toggle; browser evidence confirms the expanded state is available from the footer.
- AC-002: `src/web/app/App.test.tsx` verifies Agent-run disclosure hides and restores its turns; browser evidence confirms the wider Structure panel and interaction.
- AC-003: Browser evidence confirms the shared scrollable-pane styling and increased Inspector height with replay collapsed.
- `npm test` passed: 19 files, 70 tests; this includes the web and worker builds.
- `npm run typecheck` passed.
