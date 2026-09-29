# Sidepanel cancel-all-inflight rubric

## Latency budgets

- Cancel button click -> stream exits streaming state: <= 200ms.

## State expectations

- Step 1: at least one AssistantTurn is actively streaming; a cancel-all button is visible in the sidepanel header or stream area.
- Step 2 (click Cancel): all in-flight streams receive an abort signal via the shared CancelReason bus.
- Step 3: the Cancel button disappears; the streaming AssistantTurn exits streaming state and renders a partial or canceled label; no further tokens arrive.

## Visible affordances

- The cancel button is prominent during streaming — uses the danger/warning token, not a muted icon.
- After cancel, the turn shows a "Canceled" indicator or the partial tokens with a stopped marker.

## Failure-mode expectations

- Cancel signal failure -> stream continues; the button remains visible; the user can try again.
- A cancel on an already-completed turn -> no-op; no error surfaced.

## Cautions

- Cancel-all aborts ALL in-flight requests on this tab, including any background tooltip translates. Cross-surface cancel is intentional (matches `sidepanel-shares-tooltip-cancellation` escalation rubric).
- Partial tokens already streamed are preserved in the turn; the cancel does not blank the turn.
