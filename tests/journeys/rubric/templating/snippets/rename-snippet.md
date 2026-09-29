# Snippets rename-snippet rubric

## Latency budgets

- Rename click -> dialog open: <= 100ms.
- Submit -> storage key update: <= 200ms.

## State expectations

- Step 1: user clicks the rename affordance on a snippet row.
- Step 2: a dialog opens with the current name pre-filled.
- Step 3 (submit): the storage key updates to the new name; the body is preserved verbatim.

## Visible affordances

- Dialog has a clear heading; Submit is primary; Cancel is secondary.
- Name field carries validation hints (no empty, no duplicates).

## Failure-mode expectations

- Duplicate name on submit surfaces inline validation; submit is disabled until the conflict is resolved.
- Cancel leaves the snippet unchanged.

## Cautions

- Rename preserves the snippet's bindings (if any task is using `{{snippet.foo}}`, the binding updates automatically).
- The dialog must trap focus while open; Esc dismisses.
