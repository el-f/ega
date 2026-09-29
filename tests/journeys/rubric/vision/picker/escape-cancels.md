# Picker escape-cancels rubric

## Latency budgets

- Esc keypress -> picker overlay unmount: <= 100ms.

## State expectations

- Step 1: picker overlay is mounted.
- Step 2 (press Esc): overlay dismisses without firing a translate.
- Step 3: no toast, no tooltip, no audit entry; page returns to its pre-picker state.

## Visible affordances

- The overlay hint copy mentions Esc as the cancel affordance.

## Failure-mode expectations

- Esc inside the hint label / corner UI must still cancel — keyboard event must bubble to the document-level handler.

## Cautions

- Esc must NOT cascade into other dismissable surfaces (page modals) — capture + stop at the picker layer.
- Holding Esc must not cause repeat dispatches.
