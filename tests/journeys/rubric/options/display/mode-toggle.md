# Options-display mode-toggle rubric

## Latency budgets

- Segment click -> knob panel swap: <= 200ms (single frame fade).

## State expectations

- Step 1: Translate tab opens with DisplaySurfaceSection at the top, tooltip-mode knobs visible.
- Step 2: User clicks the Inline segment; segmented toggle flips active state, knob panel cross-fades to InlineKnobs.
- Step 3: `defaultDisplayMode` writes to storage as `'inline'`; tooltip-only knobs are no longer in the DOM.
- Step 4: Clicking Tooltip again restores the tooltip knob panel; storage flips back.

## Visible affordances

- Segmented toggle uses the standard radiogroup chrome (rounded pill background, active button filled with `--color-bg-hover`).
- Each segment carries a primary label and a one-line hint.
- The DisplayModeMock pair sits next to the toggle; only the active variant gets the accent border.
- Active-mode hint copy updates underneath the toggle (`aria-live="polite"`).

## Failure-mode expectations

- Clicking the already-active segment is a no-op (no storage write, no spurious patch).
- Reset section button hidden when knobs are at default; appears once any modification lands.

## Cautions

- Animation MUST respect `prefers-reduced-motion: reduce` — fade collapses to 0ms.
- Inline mode minimal-surface explainer must not look like an error or empty-state.
- Storage write happens via `onPatch`, never direct chrome.storage access.
