# Sidepanel target-lang-retranslate rubric

## Latency budgets

- Picker change to dispatch: 500ms debounce, then first token warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: the side panel has a finished reply on its last turn.
- Step 2 (pick a new target language): the last turn gains a new variant streaming in the new language; the old reply stays as the earlier variant.
- Step 3 (pick a language the turn already answered in): the turn flips to that variant with no request.

## Visible affordances

- A 2/2 variant counter appears while the new reply streams.
- A "→ <language>" chip names the language of the active variant.
- Prev/next variant nav restores the earlier reply.

## Failure-mode expectations

- A pick while another request streams shows a "Wait for the current reply to finish." toast and changes only the composer; the next send uses the new language.
- A second pick while the first re-answer streams cancels it and drops that half-finished reply.

## Cautions

- Earlier turns never change.
- Retry and regenerate still replay the turn's original dispatch.
