# Popup-sidepanel-handoff handoff-slot-cleared-after-read rubric

## Latency budgets

- Sidepanel mount -> slot clear: <= 200ms.

## State expectations

- Step 1: `ega.pendingPopupHandoff` (storage.session) holds a queued entry.
- Step 2: sidepanel mounts; drains its window's entries; calls `chrome.storage.session.remove('ega.pendingPopupHandoff')` (or writes back other windows' entries).
- Step 3: a second sidepanel open (no new popup send in between) drains nothing; it restores the saved thread with one turn, not a duplicate.

## Visible affordances

- N/A — this is a storage contract.

## Failure-mode expectations

- A race where the read fails -> the slot stays; the next sidepanel mount re-reads it. Better than losing the payload.
- A clear failure -> the drain throws before seeding (logged); the entry stays and the next mount within 60s seeds it once.

## Cautions

- The read + clear must be ordered: read first, clear second. Reverse order races with refresh.
- The drain removes the whole key when no other window's entries remain; other windows' entries are written back.
