# Options-advanced labs-task-backend-chain rubric

## Latency budgets

- Adding a backend to the chain -> storage write: <= 300ms.

## State expectations

- Step 1: user navigates to Advanced > Labs; the per-task backend chain editor is visible.
- Step 2: user selects the translate task and adds a backend via the chain editor.
- Step 3: `advanced.taskBackendChains[translate]` persists the new chain array to storage.

## Visible affordances

- Chain editor lists the current backends in order with drag-handle or ArrowKey reorder affordance.
- An "Add backend" control surfaces a dropdown of available (non-disabled) backends.
- Removing all entries from the chain is allowed; the chain falls back to global `backendOrder`.

## Failure-mode expectations

- Adding a disabled backend surfaces a warning inline; write still proceeds (backend may be re-enabled later).
- Storage write failure surfaces an inline error toast; chain reverts to last persisted value.

## Cautions

- A per-task chain that is empty is semantically equivalent to "no override" — writes `null` or deletes the key, not `[]`.
- Chain edits take effect on the NEXT translate dispatch; in-flight translates are not interrupted.
