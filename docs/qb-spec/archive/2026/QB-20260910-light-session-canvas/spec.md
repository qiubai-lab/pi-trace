---
id: QB-20260910-light-session-canvas
type: design
tier: standard
status: archived
created: 2026-09-10
updated: 2026-09-10
supersedes: []
---

# Light Session list and chronological canvas

## Goal

Refocus QB Trace around a Windows-friendly light interface: users first see an informative Session list, then enter a dedicated Session canvas whose primary content is a top-to-bottom chronological event timeline.

## Scope

- Replace the current dark, always-visible three-pane shell with a white/light visual system and larger default typography suitable for Windows desktop browsers.
- Make the root page a Session list rather than an empty analysis workspace with a persistent sidebar.
- Show each Session's short ID, derived title and useful context/volume/status metadata.
- Navigate into a dedicated Session detail canvas and provide an explicit way back to the Session list.
- Change timeline paging and presentation to oldest-first, so the visual flow reads from Session start at the top to latest Event at the bottom.
- Keep Event inspection deliberately lightweight while preserving lazy full-payload access.

## Non-goals

- New analytics, charts, full-text search, Session renaming or writable operations.
- A detailed conversation redesign or richer Event-specific renderers.
- Mobile-specific navigation.
- Changes to Trace capture, storage schema, authentication or Server security.

## Constraints and assumptions

- When no explicit Session title exists, the UI derives a title from the final `cwd` segment and visibly retains a short Session ID to avoid ambiguity.
- Existing Session summary, conversation projection, Event detail and live APIs remain available.
- The current user instruction is a scoped exception to the persisted dark-primary UI rule; long-term context is not updated without separate approval after verification.
- Light surfaces retain visible keyboard focus, sufficient contrast and reduced-motion/transparency behavior under the existing Apple-guided interaction rules.

## Requirements

- REQ-001: The Web application shall use a restrained white/light theme with larger, readable system typography and controls appropriate for Windows desktop browsing, while preserving semantic status colors and accessible focus states.
- REQ-002: With no selected Session, the main page shall visibly present the Session collection with title, short ID, cwd when available, model/provider, event/run/turn/tool/error counts and last activity; loading, empty, failure and pagination states remain explicit.
- REQ-003: Selecting a Session shall navigate to a dedicated canvas that identifies the Session, provides a back-to-Sessions action, and gives the timeline the primary visual area rather than retaining the Session list as a permanent pane.
- REQ-004: Session timeline data and UI shall be deterministic oldest-first and continue forward through cursor pagination without reversing or duplicating Events; hierarchy and raw modes shall preserve that chronological direction.
- REQ-005: Event selection shall expose a lightweight lazy Inspector with core metadata and Structured/Raw payload access, without expanding this change into detailed Event-type renderers.
- REQ-006: Existing token-safe URL restoration, bounded page size/virtualization, SSE ownership, read-only security boundaries and raw API compatibility shall remain intact.

## Acceptance criteria

- AC-001 [REQ-001]: Production-browser evidence shows a white interface, increased computed base/control typography, visible focus, readable status/error colors and usable reduced-motion/contrast variants at a Windows desktop viewport.
- AC-002 [REQ-002]: Seeded browser/component tests show the Session list as the root content and display short ID, derived title and required key metadata, including loading/empty/error/pagination behavior.
- AC-003 [REQ-003]: Browser navigation opens one Session in a dedicated canvas, hides the collection list, shows Session identity/summary and returns through a visible Back to Sessions control.
- AC-004 [REQ-004]: Query and UI tests with known timestamps prove the first timeline page and subsequent cursor page are oldest-to-newest with stable tie-breaking and no overlap; browser evidence shows Session start above later Events.
- AC-005 [REQ-005]: Selecting an Event lazily opens a compact Inspector with metadata plus functional Structured/Raw modes and close behavior.
- AC-006 [REQ-006]: Existing tests, typechecks, production build, security/SSE tests and a browser refresh of Session/Event state pass without exposing the token or rendering the entire Session.

## Behavior Delta

### MODIFIED

- REQ-001: The dark, compact visual system is replaced by a larger Windows-friendly light theme for this Web surface.
- REQ-002: The initial split workspace is replaced by an informative full Session collection page.
- REQ-003: Session selection now enters a dedicated analysis canvas instead of selecting a row inside a persistent sidebar.
- REQ-004: Timeline order changes from newest-first paging to start-to-finish chronological paging.
- REQ-005: Event detail remains available but is visually secondary and deliberately lightweight.

## Implementation steps

- [x] Update query cursor handling and timeline endpoint to provide oldest-first deterministic pages; add cross-page regression coverage.
- [x] Reshape the React shell into Session-list and Session-canvas states while preserving token-safe URL state and live ownership.
- [x] Replace sidebar cards with full collection rows/cards containing short ID, title and key Session metadata.
- [x] Simplify the canvas header, timeline and Event Inspector, and update timeline pagination wording/direction.
- [x] Replace dark tokens/styles with a light Windows-readable system, larger typography, accessible focus/status colors and preference fallbacks.
- [x] Update component/browser tests, run focused and full verification, and refresh the Directory Map only if structural ownership changes.

## Verification mapping

| Acceptance | Checks |
| --- | --- |
| AC-001 | Production build plus BetterWright computed typography/theme/focus and accessibility-media evidence |
| AC-002 | Session collection component states and seeded BetterWright root-page evidence |
| AC-003 | BetterWright Session entry/back navigation and URL evidence |
| AC-004 | Query/API cursor regression tests plus browser timeline order/virtual row inspection |
| AC-005 | Event detail component test and production-browser selection/mode/close evidence |
| AC-006 | `npm test`, `npm run typecheck`, shell checks, `pi -ne -e .`, security/SSE regressions and token-safe refresh |

## Verification evidence

- AC-001/AC-002: BetterWright production Chromium at 1440×900 showed the white Session library, 16px root typography, Segoe UI stack, 3px focus ring and complete Session metadata rows.
- AC-003/AC-004: Selecting the 100,001-event fixture opened a dedicated canvas with no Session collection, a visible Back to Sessions action, `SESSION START`/`OLDEST TO NEWEST` direction, Turn 0 at the top and only 18 virtual rows/15 Event rows in the DOM.
- AC-004 automated protection: `src/query.test.ts` proves oldest-first stable tie ordering across cursor pages with no overlap.
- AC-005/AC-006: Production Chromium exercised Event selection, Structured/Raw modes, close/reopen and full reload restoration. The restored URL contained Session/Event state and no token/hash; reduced-motion and increased-contrast emulation remained usable.
- Full checks: `npm test` passed 15 files/51 tests; `npm run typecheck`, shell syntax checks and `pi -ne -e .` passed; `npm audit --omit=dev` reported 0 vulnerabilities.
- 100,000-event benchmark: Session summary 143.7 ms, timeline page (200) 2.0 ms, conversation source page (200) 4.7 ms.
- BetterWright checklist `Light Session list and chronological canvas acceptance` was audited with all six items proven; evidence is retained under `/root/.betterwright/artifacts/85b42e1702877c85/`.
- No structural ownership changed, so `docs/qb-spec/DIRECTORY_MAP.md` required no update.

## Risks and recovery

- Chronological pagination can omit/duplicate equal-timestamp Events if cursor comparisons are inconsistent. Query tests must cover ties across page boundaries before UI switching.
- Light-theme contrast may regress muted metadata or status colors. Verify computed tokens and focus in the production browser rather than relying only on screenshots.
- Removing the persistent sidebar can make switching Sessions slower. A clear Back to Sessions action and restorable URL provide the intentional navigation model.
- Source rollback restores the previous React shell and descending timeline; no data migration is involved.

## Authorization

The user explicitly requested this scoped light-theme, Session-list-first and oldest-first Session canvas adjustment and asked implementation to proceed on 2026-09-10.
