# Rules-editor undo-delete rubric

## Latency budgets

- Undo toast appears after delete: <= 300ms.
- Undo click -> rule re-inserted: <= 200ms.

## State expectations

- Step 1: two rules seeded; user deletes the first rule via confirm.
- Step 2: the rule is removed from the list; an Undo toast surfaces with a 5s window.
- Step 3 (click Undo): the deleted rule is re-inserted at its original index (index 0, not appended to the bottom).

## Visible affordances

- Undo toast carries a clear "Undo" button; auto-dismisses after 5s.
- After Undo, the restored rule row appears at the correct position in the list.

## Failure-mode expectations

- If the Undo window expires, the deleted rule is gone permanently; no error shown.
- A second delete while the Undo toast is still active replaces the Undo buffer with the new deletion (single-level Undo).

## Cautions

- Re-insertion at the original index is the key contract — appending at the bottom would scramble rule order.
- The Undo buffer is in-memory only; it does not survive a page reload or sidepanel close.
