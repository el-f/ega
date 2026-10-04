# Goal: swap-backend-mid-stream

You are exploring the ega Chrome extension. Your goal is to swap the
active backend while a streaming translate is in
flight, and look for state corruption: misattributed chunks, leaked
cancellation tokens, audit entries pointing at the wrong provider.

## Surfaces in scope

- background router (CancelToken, attempt chain, streaming chunks)
- sidepanel streaming buffer + final-text reconciliation
- ActiveBackendChip during/after swap

## Hypotheses to test

1. Reordering `backendOrder` mid-stream changes the streaming destination but the
   ongoing chunks are still appended to the previous provider's transcript.
2. Disabling the active backend while it's streaming doesn't cancel the
   in-flight request; the next translate inherits a zombie connection.
3. The audit entry for the in-flight turn is written under whichever
   backend was active at _completion_, not initiation — diverging from
   billing.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
