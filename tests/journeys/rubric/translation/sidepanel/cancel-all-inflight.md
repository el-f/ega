# Sidepanel cancel-all-inflight rubric

## Latency budgets

- Cancel button click -> stream exits streaming state: <= 200ms.

## State expectations

- Step 1: at least one AssistantTurn is actively streaming; a cancel-all button is visible in the sidepanel header or stream area.
- Step 2 (click Cancel): the panel sends `translate:cancel-all`, the service worker aborts every in-flight request, and the panel cancels its own turn at once.
- Step 3: the Cancel button disappears; the streaming AssistantTurn exits streaming state and renders a partial or canceled label; no further tokens arrive.

## Visible affordances

- The header cancel-all is a plain circle-stop icon button that fades in while a request runs; the composer's Stop button is the danger-toned one.
- After cancel, the turn shows a "Canceled" indicator or the partial tokens with a stopped marker.

## Failure-mode expectations

- Cancel signal failure -> stream continues; the button remains visible; the user can try again.
- A cancel on an already-completed turn -> no-op; no error surfaced.

## Cautions

- Cancel-all aborts ALL in-flight requests in the extension, on every tab and surface (tooltip, popup, batch). Cross-surface cancel is intentional (matches `sidepanel-shares-tooltip-cancellation` escalation rubric).
- Partial tokens already streamed are preserved in the turn; the cancel does not blank the turn.
