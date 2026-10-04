# Options-display tooltip-knobs-toggle rubric

## Latency budgets

- Toggle click -> storage write: <= 200ms per toggle.

## State expectations

- Step 1: Translate tab, Display section is open in tooltip mode; tooltip knobs are visible (Show original, Click outside to dismiss, Drag to move).
- Step 2 (toggle Show original): `tooltipShowSource` flips; storage writes.
- Step 3 (toggle Click outside): `tooltipClickOutside` flips; storage writes.
- Step 4 (toggle Drag to move): `tooltipDraggable` flips; storage writes.
- Each toggle is independent.

## Visible affordances

- Each knob uses the project's Checkbox primitive with a label.
- Toggle reflects the stored value on mount; no stale initial state.

## Failure-mode expectations

- Storage write failure shows a "Change not saved" warning toast; the stored value stays unchanged.
- Knobs are only visible in tooltip mode; they are not rendered in inline mode.

## Cautions

- Each toggle fires its own independent `updateSettings` call — they do not batch.
- These knobs do NOT appear when the mode is "Inline"; switching to inline mode unmounts them entirely.
- Changes take effect on the next tooltip mount; open tooltips are not updated live.
