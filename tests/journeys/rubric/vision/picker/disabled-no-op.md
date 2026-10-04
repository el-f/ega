# Picker disabled-no-op rubric

## Latency budgets

- N/A — this is a non-render contract.

## State expectations

- Step 1: `pickerEnabled === false` in user settings.
- Step 2: a `picker:enter` message reaches the content script.
- Step 3: the content script ignores the message; no overlay mounts; no toast; no audit entry.

## Visible affordances

- N/A — the affordance is the absence.

## Failure-mode expectations

- The disabled state must propagate from popup: the popup pick tile should be visually disabled, not just silently no-op on click.

## Cautions

- This rubric guards the regression where a disabled picker still mounted the overlay.
- The disabled-check must run BEFORE any DOM mutation — short-circuit on the message handler.
