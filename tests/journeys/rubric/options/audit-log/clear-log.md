# Options-audit-log clear-log rubric

## Latency budgets

- Clear click -> confirm dialog: <= 100ms.
- Confirm -> storage empty + list shows empty state: <= 300ms.

## State expectations

- Step 1: audit-log panel has one or more entries.
- Step 2 (click Clear): a confirm dialog appears naming the count of entries to be deleted.
- Step 3 (confirm): the `egaAuditLog` key is removed from storage; the list shows the empty state.

## Visible affordances

- Confirm dialog uses the danger tone tokens.
- Empty state reads "No translations logged yet" with a short line on what the log captures.

## Failure-mode expectations

- Cancel leaves `egaAuditLog` untouched.
- A failed clear shows a danger toast ("Could not clear the audit log."); entries remain.

## Cautions

- Clear removes ALL entries including the currently filtered subset — this is not a filtered delete.
- The confirm dialog must NOT say "filtered entries only" — it clears everything.
