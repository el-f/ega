# Tooltip-sidepanel-escalation surface rubric

## Escalation channel

- Tooltip surfaces "Continue in side panel" in the error state, "Pin to side panel" on a text success, and "Open in side panel" on an image success.
- The escalation handoff carries the source text + detected lang + last assistant response (if any) into the seed conversation turn.

## Audit fan-out

- A tooltip translate adds one entry to `egaAuditLog`; the popup chip count, sidepanel inline trace, and Options Diagnostics row all reflect the entry within 1s.

## Cache parity

- Identical input under identical settings hits the cache on the second surface — tooltip first, sidepanel second (or vice versa). Cache misses across surfaces indicate a key mismatch bug.

## Cancellation

- A sidepanel Cancel-all aborts in-flight tooltip translates via the shared `CancelReason` bus.

## Settings live mutation

- A sidepanel `retryBudget` slider edit affects the NEXT tooltip attempt budget — mid-flight requests are not re-budgeted.
