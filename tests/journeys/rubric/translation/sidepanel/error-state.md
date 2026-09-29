# Sidepanel error-state rubric

## Latency budgets

- Error chunk landing -> inline error rendered on assistant turn: <= 100ms.

## State expectations

- Step 1: a turn is in flight; the backend emits an error chunk OR times out.
- Step 2: the assistant turn slot renders an inline error pill with plain-language reason (no raw HTTP), retry control, and optional secondary actions.
- Step 3: the user can click retry per the `retry-after-error` rubric; partial tokens already streamed are preserved.

## Visible affordances

- Error pill uses the danger tone tokens; carries a clear icon (alert / warning).
- Retry control is a primary affordance; "Try different backend" surfaces after two consecutive failures.

## Failure-mode expectations

- Network-offline detected -> specific message ("You're offline. Reconnect and retry."), not generic.
- Backend quota / 429 -> dedicated message ("Rate limit reached on <provider>") with a backend-switch CTA.

## Cautions

- The error pill must NOT replace the source user turn — it occupies the assistant slot only.
- Partial streamed text on a mid-stream failure is preserved alongside the error so the user can copy what landed.
