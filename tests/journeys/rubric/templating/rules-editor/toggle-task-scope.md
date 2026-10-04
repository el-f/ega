# Rules-editor toggle-task-scope rubric

## Latency budgets

- Scope chip click -> storage write: <= 150ms.

## State expectations

- Step 1: a rule is seeded with `scope.tasks = ['translate']`; after opening "Advanced rules", the "Translate ×" chip is visible in the rule's row.
- Step 2 (click the translate chip): `scope.tasks` becomes `[]`; the chip is removed, an "all tasks" badge appears, and an Undo toast ("Task removed from rule.") surfaces.
- Step 3 (optional, click Undo in the toast): the prior `scope.tasks = ['translate']` is restored and the chip returns.

## Visible affordances

- Scope chips render only for assigned tasks as ghost "Task ×" buttons with subtle text; hover shows the danger tone (click removes).
- Scope chips are inline in the rule row — keyboard-activatable (Enter / Space).

## Failure-mode expectations

- Storage write failure keeps the chip; a "Change not saved: …" warning toast appears (no inline error).

## Cautions

- `scope.tasks = []` means the rule applies to ALL tasks (global rule) — not that it is disabled.
- Removing a task scope does NOT change `enabled`; the power toggle is separate.
