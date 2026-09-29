# Recipes-gallery apply-full-undo rubric

## Latency budgets

- Undo toast appears after apply: <= 400ms.
- Undo button click -> rules + template revert: <= 300ms.

## State expectations

- Step 1: user applies a bundled recipe (full) — template body and rules are overwritten.
- Step 2: a success toast surfaces with an "Undo" action button; the Undo window is open (default ~8s).
- Step 3 (click Undo): the template body and rules revert to the state captured before the apply; the toast dismisses.

## Visible affordances

- Toast uses success tone tokens for the apply confirmation.
- "Undo" action in the toast is clearly labeled.
- After Undo, the workbench editor and rules list reflect the restored state without requiring a page reload.

## Failure-mode expectations

- If the Undo window expires before the user clicks, the toast auto-dismisses without reverting.
- Storage write failure during Undo surfaces an error toast; the post-apply state remains.

## Cautions

- The pre-apply snapshot captured by `onUndoApply` must include BOTH the template body AND the rules array.
- Undo is in-memory only (single level); there is no multi-level Undo stack.
