# Sidepanel refine-inline-freeform rubric

## Latency budgets

- Refine submit -> variant stream first token: warm <= 1.5s.

## State expectations

- Step 1: an AssistantTurn has completed; the [+ Refine] freeform input is visible below the turn.
- Step 2: user types custom refinement text into the freeform input and submits (Enter or Refine button).
- Step 3: a variant AssistantTurn spawns; the outbound request carries the custom text as the refinement modifier; no new UserTurn appends.

## Visible affordances

- The [+ Refine] input is distinct from the main composer — it is scoped to the last turn, not to the full conversation.
- Submit button or Enter key triggers the variant; Escape clears and collapses the input.
- During the variant stream, the freeform input is disabled.

## Failure-mode expectations

- Empty freeform submit -> blocked; submit control is disabled when input is empty.
- Variant failure -> inline error on the new assistant slot; freeform input re-enables.

## Cautions

- The freeform refinement text is the modifier, not a replacement for the source input. The original source must still be included in the backend request.
- Custom refinement and chip refinement share the same variant slot mechanism — both must update the cache key with their modifier.
