# Options-audit-log clear-log rubric

## Latency budgets

- Clear click -> confirm dialog: <= 100ms.
- Confirm -> storage empty + list shows empty state: <= 300ms.

## State expectations

- Step 1: audit-log panel has one or more entries.
- Step 2 (click Clear): a confirm dialog appears naming the count of entries to be deleted.
- Step 3 (confirm): `egaAuditLog` is emptied in storage; the list shows the empty state; the popup chip count resets within 1s.

## Visible affordances

- Confirm dialog uses the danger tone tokens.
- Empty state uses the standard copy ("No entries yet") with a brief explanation of what the log captures.

## Failure-mode expectations

- Cancel leaves `egaAuditLog` untouched.
- Storage write failure (unlikely) surfaces an inline error; log entries remain.

## Cautions

- Clear removes ALL entries including the currently filtered subset — this is not a filtered delete.
- The confirm dialog must NOT say "filtered entries only" — it clears everything.
- Fan-out to other surfaces (popup chip, sidepanel trace) happens within 1s via storage.onChanged.
