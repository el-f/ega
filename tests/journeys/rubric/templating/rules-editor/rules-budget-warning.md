# Rules-editor rules-budget-warning rubric

## Latency budgets

- Rules chip open with seeded >8 KB -> budget-warn banner visible: <= 300ms.

## State expectations

- Step 1: rules are seeded such that total serialized size exceeds 8 KB.
- Step 2: user opens the Rules chip in the workbench.
- Step 3: a budget-warn banner is visible at the top of the rules editor displaying the current KB count.

## Visible affordances

- Banner uses warning tone tokens; carries the KB count ("Your rules are using X.X KB — approaching the budget limit").
- Banner does NOT block interactions — it is informational only.

## Failure-mode expectations

- N/A — this is a purely informational banner; no action is blocked.

## Cautions

- The KB count displayed must reflect the actual serialized size of the rules array, not an estimate.
- The banner must appear even if the rules are all disabled — disabled rules still consume budget space.
- The banner threshold is 8 KB; verify against the rules-budget constant in the source.
