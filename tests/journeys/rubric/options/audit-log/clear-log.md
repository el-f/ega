# Options-audit-log clear-log rubric

## Latency budgets

- Clear click -> confirm dialog: <= 100ms.
- Confirm -> storage empty + list shows empty state: <= 300ms.

## State expectations

- Step 1: the Recent requests card has one or more entries; Export and Clear show in its header.
- Step 2 (click Clear): a confirm dialog "Clear recent requests?" says how many requests it removes.
- Step 3 (confirm): the `egaAuditLog` key is removed from storage; the list shows the empty state and the header buttons are gone.

## Visible affordances

- The header Clear button is secondary, not red; the dialog's Clear uses the danger tone because the clear cannot be undone.
- Empty state reads "No requests yet" / "Requests show here after you translate".

## Failure-mode expectations

- Cancel leaves `egaAuditLog` untouched.
- A failed clear shows a danger toast "Could not clear the request list" with Try again; entries remain.

## Cautions

- Clear removes ALL entries including the currently filtered subset — this is not a filtered delete.
- The confirm dialog must NOT say "filtered entries only" — it clears everything.
