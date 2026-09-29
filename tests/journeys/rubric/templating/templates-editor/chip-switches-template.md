# Templates-editor chip-switches-template rubric

## Latency budgets

- Chip click -> editor body swap: <= 150ms.

## State expectations

- Step 1: editor surface is mounted with chip rail listing scopes (Global / Translate / Explain / per-language).
- Step 2 (click a different chip): editor textarea swaps to the new scope's body without saving the prior draft.
- Step 3: the chip is highlighted as active; the Save / Reset controls reflect the new scope.

## Visible affordances

- Active chip uses an accent token; inactive chips use neutral tones.
- A "modified" indicator appears on chips with unsaved drafts.

## Failure-mode expectations

- Switching with an unsaved draft surfaces a confirm dialog ("Discard unsaved changes?") — no silent loss.

## Cautions

- Chip rail uses a proper tablist role; arrow-key navigation walks chips.
- The textarea preserves caret position across in-scope edits but resets to start on chip switch.
