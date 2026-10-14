# Tooltip cancel-loading rubric

## Latency budgets

- Cancel click -> request abort signaled: <= 100ms.
- Cancel click -> tooltip header returns to idle / dismisses: <= 200ms.

## State expectations

- Step 1: tooltip is in streaming state with a visible Cancel / Stop affordance.
- Step 2 (click Cancel): the request ends (the worker stream is stopped) and the tooltip closes.
- Step 3: the tooltip stays closed, even after the delayed reply arrives.

## Visible affordances

- A text "Cancel" button shows under the loading shimmer, then keeps showing next to Copy once text streams in, until the done frame.
- Cancel is a text button labeled "Cancel", not an icon.

## Failure-mode expectations

- A cancel that races a near-complete stream still wins — the request is aborted, not silently allowed to finish.
- Audit log records `CancelReason = 'user'` for the canceled attempt.

## Cautions

- Cancel must NOT leave the backend connection hanging — the abort signal flows all the way through.
- After cancel the tooltip is gone; running it again takes a new translate (hotkey or bubble).
