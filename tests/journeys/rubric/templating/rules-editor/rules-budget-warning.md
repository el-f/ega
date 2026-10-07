# Rules-editor rules-budget-warning rubric

## Latency budgets

- Glossary and rules tab open with seeded >8 KB of rules -> warning visible: <= 300ms.

## State expectations

- Step 1: rules are seeded so the rendered rules block for one request (task + site) exceeds 8 KB.
- Step 2: the user opens the Glossary and rules tab.
- Step 3: a warning line (role=alert) shows at the top of the Rules card, naming the 8 KB limit.

## Visible affordances

- The line uses the warning text colour and reads "Your rules are over the 8 KB limit, so Ega drops the least specific ones from each request."
- It does not block anything.

## Failure-mode expectations

- N/A — informational only.

## Cautions

- It shows only when the largest per-request rules block (any task, any scoped site) passes the limit.
- Rules that are off do not count.
- The threshold is 8 KB; verify against the rules-budget constant in the source.
