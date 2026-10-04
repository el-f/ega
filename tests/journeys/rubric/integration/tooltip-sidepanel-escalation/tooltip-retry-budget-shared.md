# Tooltip-sidepanel-escalation tooltip-retry-budget-shared rubric

## Latency budgets

- Slider change -> storage write: <= 200ms.
- Next tooltip attempt uses new budget: <= 1s after slider commit.

## State expectations

- Step 1: sidepanel header "More actions" menu > "Fallback backends: N…" opens a "Fallback backends" popover with a 0–3 slider (`advanced.retryCount`).
- Step 2 (slider commit to value N): `settings.advanced.retryCount = N` writes to storage.
- Step 3: the next tooltip request tries up to 1 + N backends; an in-flight tooltip request is NOT re-budgeted mid-stream.

## Visible affordances

- Slider commits on release (`onchange`), not on every input event.
- No ack on success; a failed write reverts the slider and shows a danger toast.

## Failure-mode expectations

- A slider commit during a tooltip retry storm does NOT alter the in-flight retry pace — the running attempts finish under their original budget.

## Cautions

- The retry budget is a setting; cache digest must include it OR the budget must NOT affect request shape (output identity). Reread the cache contract.
- Slider tick marks should use the project number tokens.
