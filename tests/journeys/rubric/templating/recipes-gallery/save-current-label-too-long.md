# Recipes-gallery save-current-label-too-long rubric

## Latency budgets

- Submit with 81-char label -> inline error shown: <= 100ms.

## State expectations

- Step 1: user opens "+ New from current" dialog.
- Step 2: user types a label that exceeds 80 characters (81+ chars).
- Step 3 (click submit): an inline error surfaces naming the character limit; no storage write occurs.

## Visible affordances

- Inline error uses the danger tone tokens and states the max length (e.g., "Label must be 80 characters or fewer").
- A character counter below the label input shows current / max (e.g., "81 / 80").
- Submit button is disabled while the label is over the limit.

## Failure-mode expectations

- The dialog must stay open; the user can shorten the label and re-submit.
- `userRecipes` remains unchanged after the blocked submit.

## Cautions

- The 80-character limit is BODY_MAX for labels; verify against the recipe schema constant.
- The character counter must update in real-time as the user types — not just on submit.
