# Snippets add-snippet rubric

## Latency budgets

- Add click -> new snippet row + body focus: <= 200ms.

## State expectations

- Step 1: user clicks the "Add snippet" button.
- Step 2: a new snippet row appears at the bottom of the list with a default name; the body textarea receives focus.
- Step 3: the snippet persists to storage immediately with empty body — refresh recovers it.

## Visible affordances

- Add button uses the primary action tokens.
- The new row's name field is editable inline.

## Failure-mode expectations

- Storage quota near full -> add surfaces a warning toast; the in-memory snippet still appears so the user can review.

## Cautions

- Empty-body snippets are valid — the user might create the slot first and fill it later.
- Adding does NOT auto-bind the snippet to any task; binding is a separate step.
