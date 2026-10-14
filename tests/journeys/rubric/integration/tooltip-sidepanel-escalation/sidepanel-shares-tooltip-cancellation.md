# Tooltip-sidepanel-escalation sidepanel-shares-tooltip-cancellation rubric

## Latency budgets

- Sidepanel Cancel-all -> tooltip in-flight abort: <= 200ms.

## State expectations

- Step 1: tooltip has an in-flight translate; the sidepanel has its own translate in flight (Cancel-all shows only then).
- Step 2 (sidepanel Cancel-all): the panel sends `translate:cancel-all`; the SW router aborts every in-flight request, the tooltip's included.
- Step 3: tooltip shows its error state with a Retry button and stays open.

## Visible affordances

- The sidepanel Cancel-all affordance is documented in tooltips / surface help.

## Failure-mode expectations

- Cancel-all is hidden while the panel has nothing in flight; it adds no toast of its own, but the aborted tooltip request shows a danger toast "On the page — Canceled: …".

## Cautions

- Cancel-all reaches other surfaces via the `translate:cancel-all` runtime message to the SW, not via shared state.
- Cancel-all must NOT close the tooltip — only cancel the request.
