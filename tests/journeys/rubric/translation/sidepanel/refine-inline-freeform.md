# Sidepanel refine-inline-freeform rubric

## Latency budgets

- Refine submit -> variant stream first token: warm <= 1.5s.

## State expectations

- Step 1: an AssistantTurn has completed; its Refine button opens the chip row, and the "Refine" chip in that row opens the freeform input.
- Step 2: user types custom refinement text into the freeform input and submits (Enter or the Apply button).
- Step 3: a variant AssistantTurn spawns; the outbound request carries the custom text as the refinement modifier; no new UserTurn appends.

## Visible affordances

- The Refine input is distinct from the main composer — it is scoped to the last turn, not to the full conversation.
- The Apply button or Enter triggers the variant; clicking Refine again collapses the input.
- On submit the input clears and the chip row closes; it stays closed after the variant finishes until Refine is pressed again.

## Failure-mode expectations

- Empty freeform submit -> blocked; submit control is disabled when input is empty.
- Variant failure -> inline error with Retry on the turn; the refine row returns once a done variant is active again.

## Cautions

- The freeform refinement text is the modifier, not a replacement for the source input. The original source must still be included in the backend request.
- Custom refinement and chip refinement share the same variant slot mechanism — both must update the cache key with their modifier.
