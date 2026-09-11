# UI Style Specification

## Scope

These rules are the default for QB Trace Web analysis surfaces. They apply to new components and meaningful redesigns; they do not require unrelated TUI or CLI output to imitate the Web UI. A task-specific user instruction may define a local exception without changing this document.

The repository `apple-design` skill is the design guidance source. Executable colors, spacing, typography, motion and preference fallbacks remain canonical in the Web design tokens and CSS under `src/web/`.

## Product character

- Prefer a calm, precise IDE/debugger workbench over a decorative dashboard.
- Optimize for deep desktop analysis and high information density without making every surface visually loud.
- Every screen must make current Session, current view, active filters and selected Event understandable.
- Preserve user agency: analysis views are switchable, raw recorded data remains reachable, and projections never hide uncertainty or fabricate context.

## Layout and hierarchy

- Use a stable navigation → analysis → inspector spatial model for Session work.
- Resizable regions must track pointer input directly and remain keyboard operable; selection and context must survive resizing.
- Use proximity, weight, spacing and restrained surface contrast before adding borders or decoration.
- Keep common analysis actions visible near the content they affect. Advanced and raw detail may sit one level deeper.
- Narrow layouts require a safe, understandable fallback, but mobile-specific workflows are not the default target.

## Typography and color

- Use the platform system font for interface text and a system monospace stack for IDs, event types, paths and payloads.
- Tighten large headings and use compact but legible leading for dense analysis rows; never apply one tracking value to every size.
- Dark mode is the current primary surface. Color communicates selection, recording/live state, warning and error; it is not the sole carrier of meaning.
- Sensitive-data status remains visible without dominating the analysis workspace.

## Motion and direct manipulation

- Motion exists to explain state, hierarchy or spatial continuity, not to decorate routine data updates.
- Feedback begins immediately on press/focus. Never lock input until a transition finishes.
- Gesture-driven resizing or movement tracks 1:1, respects the current on-screen value and remains interruptible.
- Default state motion is short and critically damped with no decorative overshoot. Bounce is reserved for a real momentum-carrying gesture.
- Enter and exit paths remain spatially symmetric and anchored to their source.
- Animate compositor-friendly properties where possible and avoid motion work proportional to total Event count.

## Materials and detail

- Translucent chrome may separate top-level navigation or toolbars when it improves hierarchy; do not stack multiple light translucent surfaces.
- Analysis rows and payloads prioritize legibility and stable alignment over glass effects, gradients or heavy shadows.
- Radius, shadow and accent use must be consistent and restrained. Selected state, keyboard focus and errors must remain unmistakable.
- Empty, loading, unavailable, disconnected and retry states are intentional UI states, not incidental text dumps.

## Accessibility and performance

- All primary navigation, view switches, disclosures, filters, panel separators and detail modes must be keyboard reachable with visible focus.
- Respect `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`; reduced motion keeps status feedback while removing spatial movement.
- Layout must tolerate browser text scaling and use semantic labels/roles rather than relying on icon recognition.
- Long Session views use bounded requests and virtualization. Full payloads load only after explicit Event selection, and expensive large-payload formatting stays off the interaction path.

## Review expectations

For meaningful Web UI changes, verify the affected interaction in a real browser in addition to component tests. Review at least the normal state, keyboard path, loading/empty/error state, relevant large-data behavior and applicable accessibility media preferences. Use BetterWright evidence when available for user-visible acceptance.
