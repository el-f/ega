# Rules-editor edit-rule-body rubric

## Latency budgets

- Click-to-edit -> body becomes editable: <= 100ms.
- Commit (blur or Enter) -> storage write: <= 200ms.

## State expectations

- Step 1: rule row shows the body text as a static display.
- Step 2 (click body): the body becomes an inline textarea holding the current text; focus is not moved into it.
- Step 3 (blur or Ctrl/Cmd+Enter): trimmed text persists; row returns to static display with the new body.

## Visible affordances

- Editable state is visually distinct (border / background change).

## Failure-mode expectations

- Escaping (Esc) reverts the edit without committing.
- Empty body on commit is dropped silently (no validation message); the previous value is retained.

## Cautions

- Trim only leading/trailing whitespace — internal whitespace is significant for rule semantics.
- The edit must NOT enable / disable the rule; the toggle is separate.
