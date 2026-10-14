# Rules-editor undo-delete rubric

## Latency budgets

- Undo toast appears after delete: <= 300ms.
- Undo click -> rule re-inserted: <= 200ms.

## State expectations

- Step 1: two rules seeded; the user opens the first with Edit and presses "Delete rule" (no confirm).
- Step 2: the rule leaves the list; a toast Deleted "<rule>" with an Undo button stays 8s, longer while hovered or focused.
- Step 3 (Undo): the rule is re-inserted at its original index (index 0, not the bottom), and focus moves to its checkbox.

## Visible affordances

- The toast carries a clear "Undo" button; it hides after 8s, and the timer waits while the pointer or focus is on it.
- After Undo, the restored row is at its old place.

## Failure-mode expectations

- After the toast is gone, the delete is final; no error shows.
- A second delete pushes its own toast; each Undo restores only its own rule, into the list as it is now.

## Cautions

- Re-insertion at the original index is the key contract.
- The Undo buffer is in memory only; it does not survive a reload.
