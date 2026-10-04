# Settings-runtime-propagation display-mode-change-live rubric

## Latency budgets

- Display mode toggle -> mounted tooltip re-render: <= 200ms.

## State expectations

- Step 1: `defaultDisplayMode` is `tooltip`; user opens Options.
- Step 2 (pick Inline in Options > Translate > Display surface): storage commit fires.
- Step 3: the next translate trigger on the page uses mode B (inline) — no page reload; a mounted tooltip is not re-rendered.

## Visible affordances

- The tooltip content remains anchored to the selection.

## Failure-mode expectations

- Inline mode on an editable selection (input, textarea, contenteditable) silently falls back to the tooltip; no notice.

## Cautions

- The content script's settings cache updates on storage change; the display mode is read at each trigger, not at page load.
- Switching to inline-replace mid-display does NOT auto-trigger the replacement; the user must explicitly act.
