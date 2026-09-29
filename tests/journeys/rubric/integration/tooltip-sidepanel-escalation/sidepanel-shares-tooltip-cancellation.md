# Tooltip-sidepanel-escalation sidepanel-shares-tooltip-cancellation rubric

## Latency budgets

- Sidepanel Cancel-all -> tooltip in-flight abort: <= 200ms.

## State expectations

- Step 1: tooltip has an in-flight translate; sidepanel is mounted.
- Step 2 (sidepanel Cancel-all): the shared CancelReason bus dispatches; the tooltip's in-flight AbortController fires.
- Step 3: tooltip surfaces a canceled state; audit log records `CancelReason = 'sidepanel-cancel-all'`.

## Visible affordances

- The sidepanel Cancel-all affordance is documented in tooltips / surface help.

## Failure-mode expectations

- A tooltip whose request is not cancellable (rare) surfaces an inline notice on the sidepanel side.
- Cancel-all is idempotent — pressing it with nothing in flight is a no-op with no toast.

## Cautions

- The CancelReason bus must propagate across surfaces via `chrome.runtime` messages, not via shared state.
- Cancel-all must NOT close the tooltip — only cancel the request.
