# Tooltip context-preview rubric

## Latency budgets

- Preview render after stream completion: <= 150ms.

## State expectations

- Step 1: the request carried surrounding-page `contextSent` (text fragments).
- Step 2: a Context icon button (`aria-label="Show what was sent"`) shows in the action row; the context list starts closed.
- Step 3 (click the Context button): a label/value list of the sent context opens under the actions, with a "Show raw JSON" toggle; clicking again ("Hide what was sent") closes it.

## Visible affordances

- The open list is visually distinct from the result body; each entry has a bold label (`dt`) and its value.
- Expand / collapse is the Context icon button in the action row, with `aria-expanded` and a "Context" / "Hide context" hint.

## Failure-mode expectations

- When `contextSent` is empty or undefined, the footer is hidden (no empty section).

## Cautions

- Context preview must NOT show data the user is unaware was sent — if the request includes the surrounding paragraph, the preview must surface it. Honesty about what the model saw.
- Context strings may include sensitive page content; the preview rendering must not leak past the tooltip's clip rect.
