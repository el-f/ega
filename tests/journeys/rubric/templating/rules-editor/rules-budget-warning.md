# Rules-editor rules-budget-warning rubric

## Latency budgets

- Tasks tab open with seeded >8 KB of rules -> budget-warn banner visible: <= 300ms.

## State expectations

- Step 1: rules are seeded so the rendered rules block for one request (task + site) exceeds 8 KB.
- Step 2: user opens the Tasks tab; the Rules section is on it.
- Step 3: a warning banner (role=alert) is visible above the Rules card, naming the 8 KB limit.

## Visible affordances

- Banner uses warning tone tokens; text reads "Your rules are over the 8 KB limit, so Ega drops the least specific ones from each request."
- Banner does NOT block interactions — it is informational only.

## Failure-mode expectations

- N/A — this is a purely informational banner; no action is blocked.

## Cautions

- The banner shows only when the largest per-request rendered rules block (any task, any scoped site) exceeds the limit.
- Disabled rules do not count toward the budget; a set that is over the limit only through disabled rules shows no banner.
- The banner threshold is 8 KB; verify against the rules-budget constant in the source.
