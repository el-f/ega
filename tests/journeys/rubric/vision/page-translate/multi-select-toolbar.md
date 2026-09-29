# Page-translate translate-areas toolbar rubric

## State expectations

- Step 1: `page:translateAll` opens translate-areas mode. The toolbar appears and every pickable
  block highlights on hover.
- Step 2: clicking a block selects it; clicking it again deselects it. The toolbar shows the count.
- Step 3: Enter, or the toolbar's translate button, fires the selected blocks and leaves the mode.
- Step 4: a settled run leaves the progress pill on screen. Starting page-translate again while
  that pill is open re-opens the mode — it is never a silent no-op.

## Refusals

- The document root is not pickable. `<html>` and `<body>` never highlight and never enter the
  selection, because in-place mode would detach the whole document including our own shadow host,
  leaving Cancel and revert unreachable.
- A block already carrying a translation from this run is not offered again, so a second pass
  cannot translate the translation.
- A block too long for one request is refused visibly. It is never silently truncated, because
  in-place mode would then destroy the untranslated remainder.

## Visible affordances

- Hover outline on a candidate, a persistent outline on a selected block, a live count in the
  toolbar, and Escape to leave the mode without translating.

## Latency budgets

- Hover outline follows the pointer within one frame.
- Leaving the mode removes every outline and the toolbar within 200ms.

## Failure-mode expectations

- A failed block shows its own error with a retry control; its neighbours keep their translations.
- Cancel reverts every mounted block and stops the in-flight requests.
