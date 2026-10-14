# Options-backends reorder-keyboard rubric

## Latency budgets

- Alt+ArrowDown -> storage write: <= 200ms.

## State expectations

- Step 1: user focuses the drag-handle or gutter of a backend card.
- Step 2 (Alt+ArrowDown): the focused backend swaps one position down in `backendOrder`; the card moves visually.
- Step 3: `backendOrder` in storage reflects the new order; the new head of the chain (index 0) becomes the active backend.

## Visible affordances

- Each backend card's gutter carries a drag-handle affordance that is keyboard-focusable.
- Focused gutter shows a visible focus ring.
- Alt+ArrowUp moves the card up; Alt+ArrowDown moves it down.
- Cards at the first or last position cannot move further in that direction (no wrap).

## Failure-mode expectations

- Alt+ArrowDown on the last card: no-op (clamps at bottom).
- Storage write failure shows a "Change not saved" warning toast; `backendOrder` keeps the prior order.

## Cautions

- Reorder takes effect on the next translate dispatch; in-flight translates are not interrupted.
- The visual move must be a CSS transition (not a DOM re-mount) to avoid focus loss on the gutter.
