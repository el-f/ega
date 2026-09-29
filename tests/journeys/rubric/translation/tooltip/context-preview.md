# Tooltip context-preview rubric

## Latency budgets

- Preview render after stream completion: <= 150ms.

## State expectations

- Step 1: the request carried surrounding-page `contextSent` (text fragments).
- Step 2: footer renders a ContextPreview block listing the context sent, truncated to a readable summary.
- Step 3 (click to expand): full context surfaces inline; collapse restores the truncated view.

## Visible affordances

- Footer is visually distinct from the result body (border, label "Context sent to model").
- Expand / collapse uses a chevron with rotation animation under the project's motion tokens.

## Failure-mode expectations

- When `contextSent` is empty or undefined, the footer is hidden (no empty section).

## Cautions

- Context preview must NOT show data the user is unaware was sent — if the request includes the surrounding paragraph, the preview must surface it. Honesty about what the model saw.
- Context strings may include sensitive page content; the preview rendering must not leak past the tooltip's clip rect.
