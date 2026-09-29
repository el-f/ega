# Popup-sidepanel-handoff handoff-slot-cleared-after-read rubric

## Latency budgets

- Sidepanel mount -> slot clear: <= 200ms.

## State expectations

- Step 1: `pendingPopupHandoff` carries a payload.
- Step 2: sidepanel mounts; reads the payload; calls `chrome.storage.local.remove('pendingPopupHandoff')`.
- Step 3: a second sidepanel open (with no fresh popup activity in between) reads NOTHING — mounts clean.

## Visible affordances

- N/A — this is a storage contract.

## Failure-mode expectations

- A race where the read fails -> the slot stays; the next sidepanel mount re-reads it. Better than losing the payload.
- A clear failure -> the slot is read on next mount; the user sees the same payload twice. Logged but recoverable.

## Cautions

- The read + clear must be ordered: read first, clear second. Reverse order races with refresh.
- The clear must remove the WHOLE slot, not just the payload — leaving an empty `{}` would seed an empty turn.
