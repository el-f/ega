# Popup-sidepanel-handoff handoff-slot-survives-popup-close rubric

## Latency budgets

- Cold-start sidepanel mount + read of pre-existing slot: <= 600ms.

## State expectations

- Step 1: popup writes the handoff payload then closes (window dismisses fast).
- Step 2: sidepanel is NOT yet open. The slot persists in storage.
- Step 3 (user opens sidepanel later, before TTL): sidepanel cold-starts, reads the slot, seeds the conversation.

## Visible affordances

- N/A — this is a persistence contract.

## Failure-mode expectations

- If the user takes longer than the TTL (60s) the slot is treated as stale on read — separate rubric.
- A second popup send before the sidepanel mounts queues beside the first; both drain in send order.

## Cautions

- The queue lives in `chrome.storage.session` (survives popup close), not the page `sessionStorage`.
- The slot must include a timestamp for staleness detection.
