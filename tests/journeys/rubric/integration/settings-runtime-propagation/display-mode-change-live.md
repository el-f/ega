# Settings-runtime-propagation display-mode-change-live rubric

## Latency budgets

- Display mode toggle -> mounted tooltip re-render: <= 200ms.

## State expectations

- Step 1: tooltip is mounted in display mode A (e.g., side-by-side); user opens Options.
- Step 2 (toggle display mode to B, e.g., inline-replace): storage commit fires.
- Step 3: the mounted tooltip re-renders to honor mode B — without close+reopen.

## Visible affordances

- The transition uses motion tokens; under 200ms.
- The tooltip content remains anchored to the selection.

## Failure-mode expectations

- A mode that requires capabilities the tooltip doesn't have (e.g., inline-replace on read-only DOM) surfaces an inline notice instead of silently failing.

## Cautions

- The tooltip must re-read the display mode on storage change — not at mount only.
- Switching to inline-replace mid-display does NOT auto-trigger the replacement; the user must explicitly act.
