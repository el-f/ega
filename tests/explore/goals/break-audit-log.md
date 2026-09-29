# Goal: break-audit-log

You are exploring the ega Chrome extension. Your goal is to find a way to
corrupt or starve the audit log such that legitimate translate events are
dropped or misattributed.

## Surfaces in scope

- options Audit Log panel
- sidepanel inline trace
- popup ActiveBackendChip rolling count

## Hypotheses to test

1. Rapid translate burst overflows the rolling-50 in a way that drops an
   event reported as successful.
2. Settings reset clears the audit log but the popup chip still reports a
   stale count for one render frame.
3. Cross-tab translate races append events out-of-order; severity
   classification mis-orders error/success pairs.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
