# Sidepanel error-state rubric

## Latency budgets

- Error chunk landing -> inline error rendered on assistant turn: <= 100ms.

## State expectations

- Step 1: a turn is in flight; the backend emits an error chunk OR times out.
- Step 2: the assistant turn slot renders an inline error block: a plain-language heading and reason, Retry for retryable codes, and "Open settings" when a setting fixes the error.
- Step 3: the user can click retry per the `retry-after-error` rubric; partial tokens already streamed are preserved.

## Visible affordances

- Error block uses the danger text token with a bold heading naming the failure; it carries no icon.
- Retry shows for retryable codes; a "Check your backends" button surfaces after a second failure on the same turn when no settings tab fixes the code.

## Failure-mode expectations

- Network failure -> "Network issue" heading with the reason, and Retry.
- Backend 429 -> "Rate limit reached" heading with Retry ("Retry in Ns" while Retry-After runs); out of credit -> "Out of credit" with "Open settings".

## Cautions

- The error pill must NOT replace the source user turn — it occupies the assistant slot only.
- Partial streamed text on a mid-stream failure is preserved alongside the error so the user can copy what landed.
