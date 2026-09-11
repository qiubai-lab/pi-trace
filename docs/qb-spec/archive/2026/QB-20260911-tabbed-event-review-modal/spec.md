---
id: QB-20260911-tabbed-event-review-modal
type: feature
tier: standard
status: archived
created: 2026-09-11
updated: 2026-09-11
supersedes: []
---

# Tabbed event review modal

## Goal
Make long event records easier to inspect by making the selected review surface occupy the modal workspace and separating review, metadata, and raw data into direct top-level tabs.

## Scope
- Add top-level tabs for 审阅视图、事件信息 and 原始 Payload.
- Make the active content panel fill the modal’s available width and height, with scrolling contained within that panel.
- Replace each content block’s text-mode button with an explicit two-option segmented switch for Markdown rendering and source text.
- Pretty-print valid raw Payload JSON before display, retaining invalid source unchanged.

## Non-goals
- Do not change event retrieval, semantic event parsing, or remove access to recorded source.
- Do not add syntax highlighting beyond formatted JSON structure.

## Behavior Delta
### MODIFIED
- REQ-001: The prior stacked review, metadata disclosure, and raw-Payload control are replaced by three top-level tabs.
- REQ-002: The prior content-height-driven review blocks become a full available-space active workspace with internal scrolling.
- REQ-003: The prior single action text-mode button becomes a two-sided Markdown/文本原文 segmented switch.
- REQ-004: Valid raw Payload source is now indented JSON; invalid source remains accessible verbatim.

## Requirements
- REQ-001: The modal provides keyboard-accessible top tabs labelled 审阅视图、事件信息 and 原始 Payload, with exactly one visible panel.
- REQ-002: The visible tab panel fills the modal content region and independently scrolls long content without expanding or scrolling the modal shell.
- REQ-003: Each reviewable prompt, input, response, or tool content block provides an explicit two-option Markdown 渲染 / 文本原文 control, defaulting to Markdown.
- REQ-004: The 原始 Payload panel formats valid JSON with indentation and preserves malformed content rather than failing or hiding it.

## Acceptance
- AC-001 (REQ-001): Selecting each top tab visibly replaces the workspace panel and updates selected tab state.
- AC-002 (REQ-002): A long content value remains within a full-size panel whose own scroll range is usable at desktop and narrow viewport sizes.
- AC-003 (REQ-003): A Markdown heading/list/code sample renders by default and the explicit text side of the switch exposes source text.
- AC-004 (REQ-004): A valid JSON Payload is displayed across indented lines; malformed stored text is still shown exactly.

## Implementation
- [ ] Restructure `EventDetail` around accessible tab controls and panel bodies.
- [ ] Add formatted raw JSON state, reusing worker formatting for large values where appropriate.
- [ ] Convert readable-content mode to an explicit segmented control.
- [ ] Update modal and content CSS for fixed workspace layout and contained scrolling.
- [ ] Update component and conversation tests.

## Verification
- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `git diff --check`
- [ ] Browser verification of tabs, content switch, raw JSON, keyboard and narrow viewport behavior.
