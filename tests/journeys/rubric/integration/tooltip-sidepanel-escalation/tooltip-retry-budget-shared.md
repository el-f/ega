# Tooltip-sidepanel-escalation tooltip-retry-budget-shared rubric

## Latency budgets

- Slider change -> storage write: <= 200ms.
- Next tooltip attempt uses new budget: <= 1s after slider commit.

## State expectations

- Step 1: sidepanel has a `retryBudget` slider in its settings surface.
- Step 2 (slider commit to value N): `settings.retryBudget = N` writes to storage.
- Step 3: the next tooltip-initiated request uses N as the retry budget; an in-flight tooltip request is NOT re-budgeted mid-stream.

## Visible affordances

- Slider commits on release (`oncommit`), not on every input event (perf rule).
- A subtle "Saved" ack appears after commit.

## Failure-mode expectations

- A slider commit during a tooltip retry storm does NOT alter the in-flight retry pace — the running attempts finish under their original budget.

## Cautions

- The retry budget is a setting; cache digest must include it OR the budget must NOT affect request shape (output identity). Reread the cache contract.
- Slider tick marks should use the project number tokens.
