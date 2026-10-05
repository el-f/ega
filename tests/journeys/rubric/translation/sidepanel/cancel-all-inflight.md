# Sidepanel cancel-all-inflight rubric

## Latency budgets

- Cancel button click -> stream exits streaming state: <= 200ms.

## State expectations

- Step 1: at least one AssistantTurn is actively streaming; the "More actions" (⋯) menu offers "Cancel all requests" as its last item.
- Step 2 (click Cancel): the panel sends `translate:cancel-all`, the service worker aborts every in-flight request, and the panel cancels its own turn at once.
- Step 3: the menu closes and no longer offers the item; the streaming AssistantTurn exits streaming state and renders a partial or canceled label; no further tokens arrive.

## Visible affordances

- The composer's Stop button is the one stop control on screen; Cancel all requests lives in the More actions menu and the command palette, and only while a request runs.
- After cancel, the turn shows a "Canceled" indicator or the partial tokens with a stopped marker.

## Failure-mode expectations

- Cancel signal failure -> stream continues; the menu item is still offered; the user can try again.
- A cancel on an already-completed turn -> no-op; no error surfaced.

## Cautions

- Cancel-all aborts ALL in-flight requests in the extension, on every tab and surface (tooltip, popup, batch). Cross-surface cancel is intentional (matches `sidepanel-shares-tooltip-cancellation` escalation rubric).
- Partial tokens already streamed are preserved in the turn; the cancel does not blank the turn.
