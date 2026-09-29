# Sidepanel refine-on-explain-turn rubric

## Latency budgets

- Refine chip click after explain -> variant stream first token: warm <= 1.5s.

## State expectations

- Step 1: an explain task turn has completed in the sidepanel (AssistantTurn with `task=explain`).
- Step 2: quick-refine chips render below the explain turn (e.g., [Shorter], [More detail]).
- Step 3 (click [Shorter]): a variant AssistantTurn spawns; the outbound request carries `task=explain` and the [Shorter] modifier; the variant explains the same source text but in a shorter form.

## Visible affordances

- Chips render for explain turns (same set as translate turns, unless explain-specific chips are configured).
- The variant turn header reflects `task=explain` — the task label does not revert to translate.

## Failure-mode expectations

- Variant failure -> inline error on variant slot; the original explain turn remains readable.

## Cautions

- The refine request must set `explain=true` (or equivalent) on the wire — the variant must be an explain refinement, not a translate refinement.
- The source text for the explain refine is the same text that drove the original explain, not the explain result body.
