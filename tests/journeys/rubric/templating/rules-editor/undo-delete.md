# Rules-editor undo-delete rubric

## Latency budgets

- Undo toast appears after delete: <= 300ms.
- Undo click -> rule re-inserted: <= 200ms.

## State expectations

- Step 1: two rules seeded; user deletes the first rule (no confirm).
- Step 2: the rule is removed from the list; a "Rule deleted." toast with an Undo button stays 8s, longer while hovered or focused.
- Step 3 (click Undo): the deleted rule is re-inserted at its original index (index 0, not appended to the bottom).

## Visible affordances

- Undo toast carries a clear "Undo" button; it hides after 8s, and the timer waits while the pointer or focus is on it.
- After Undo, the restored rule row appears at the correct position in the list.

## Failure-mode expectations

- If the Undo window expires, the deleted rule is gone permanently; no error shown.
- A second delete pushes its own Undo toast; each toast restores only its own rule.

## Cautions

- Re-insertion at the original index is the key contract — appending at the bottom would scramble rule order.
- The Undo buffer is in-memory only; it does not survive an options page reload or close.
