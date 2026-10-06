# Sidepanel refine-on-explain-turn rubric

## Latency budgets

- Refine chip click after explain -> variant stream first token: warm <= 1.5s.

## State expectations

- Step 1: an explain task turn has completed in the sidepanel (AssistantTurn with `task=explain`).
- Step 2: pressing the turn's Refine button opens the quick-refine chips below the explain turn ([Shorter], [Less formal], [Keep slang], [Refine]).
- Step 3 (click [Shorter]): a variant AssistantTurn spawns; the outbound request carries `task=explain` and the [Shorter] modifier; the variant explains the same source text but in a shorter form.

## Visible affordances

- Chips render for explain turns — the same fixed set as translate turns.
- The variant keeps task=explain — the streaming label reads "Explaining…" and the "Try as…" menu still shows Explain checked.

## Failure-mode expectations

- Variant failure -> inline error on variant slot; the original explain turn remains readable.

## Cautions

- The refine request must set `explain=true` (or equivalent) on the wire — the variant must be an explain refinement, not a translate refinement.
- The source text for the explain refine is the same text that drove the original explain, not the explain result body.
