# Rules-editor toggle-task-scope rubric

## Latency budgets

- Scope chip click -> storage write: <= 150ms.

## State expectations

- Step 1: a rule is seeded with `scope.tasks = ['translate']`; the translate scope chip is visible in the rule row.
- Step 2 (click the translate chip): `scope.tasks` becomes `[]`; the chip deactivates (removed or deselected styling).
- Step 3 (click the translate chip again): `scope.tasks` becomes `['translate']`; the chip activates.

## Visible affordances

- Active scope chips use the accent tokens; inactive chips use neutral styling.
- Scope chips are inline in the rule row — keyboard-activatable (Enter / Space).

## Failure-mode expectations

- Storage write failure reverts the chip to its prior state; an inline error icon appears on the row.

## Cautions

- `scope.tasks = []` means the rule applies to ALL tasks (global rule) — not that it is disabled.
- Adding a task scope does NOT enable the rule if it was previously disabled (`enabled` field is separate).
