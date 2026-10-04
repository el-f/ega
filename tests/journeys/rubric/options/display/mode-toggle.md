# Options-display mode-toggle rubric

## Latency budgets

- Segment click -> knob panel swap: <= 200ms (single frame fade).

## State expectations

- Step 1: Translate tab opens with DisplaySurfaceSection at the top, tooltip-mode knobs visible.
- Step 2: User clicks the Inline card; the active state moves to it and the knob panel fades in the note "Inline mode has no settings of its own."
- Step 3: `defaultDisplayMode` writes to storage as `'inline'`; tooltip-only knobs are no longer in the DOM.
- Step 4: Clicking Tooltip again restores the tooltip knob panel; storage flips back.

## Visible affordances

- Mode picker is two bordered cards; the active card gets the accent border and a soft accent background.
- Each segment carries a primary label and a one-line hint.
- Each mode card holds its DisplayModeMock preview; only the active card and its mock get the accent border.

## Failure-mode expectations

- Clicking the already-active segment is a no-op (no storage write, no spurious patch).
- Reset section button hidden when knobs are at default; appears once any modification lands.

## Cautions

- Animation MUST respect `prefers-reduced-motion: reduce` — fade collapses to 0ms.
- Inline mode minimal-surface explainer must not look like an error or empty-state.
- Storage write happens via `onPatch`, never direct chrome.storage access.
