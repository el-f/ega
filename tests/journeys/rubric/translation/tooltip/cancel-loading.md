# Tooltip cancel-loading rubric

## Latency budgets

- Cancel click -> request abort signaled: <= 100ms.
- Cancel click -> tooltip header returns to idle / dismisses: <= 200ms.

## State expectations

- Step 1: tooltip is in streaming state with a visible Cancel / Stop affordance.
- Step 2 (click Cancel): the AbortController is triggered; no further tokens land; partial body is either retained (if useful) or cleared (consistency required).
- Step 3: the tooltip remains mounted with the source selection so the user can re-trigger or copy the input.

## Visible affordances

- Cancel button replaces the streaming indicator while a request is in flight.
- Cancel button carries an aria-label like "Stop translation" — not just an icon.

## Failure-mode expectations

- A cancel that races a near-complete stream still wins — the request is aborted, not silently allowed to finish.
- Audit log records `CancelReason = 'user'` for the canceled attempt.

## Cautions

- Cancel must NOT leave the backend connection hanging — the abort signal flows all the way through.
- After cancel, retry is available; the prior input is preserved verbatim.
