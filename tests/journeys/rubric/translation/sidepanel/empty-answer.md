# Sidepanel empty-answer rubric

## Latency budgets

- `done` chunk with no text -> notice rendered on the assistant turn: <= 100ms.

## State expectations

- Step 1: a turn is in flight; the backend finishes with an empty translation.
- Step 2: the assistant slot shows a muted notice ("No reply came back. Click Regenerate, or check the model in Settings → Backends.") instead of a blank card; Regenerate stays available.
- Step 3: a later reply with text renders normally with no notice.

## Visible affordances

- Notice uses the muted tone, not the danger tone — nothing failed, the answer was empty.
- Regenerate and the Refine button keep working on the turn.

## Failure-mode expectations

- A reply that is only whitespace counts as empty.
- The notice must not be mistaken for streaming: no cursor, no skeleton.

## Cautions

- The user turn is untouched; only the assistant slot changes.
- The empty reply is not cached as a good answer.
