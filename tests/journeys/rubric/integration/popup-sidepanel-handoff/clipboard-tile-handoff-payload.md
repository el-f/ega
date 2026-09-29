# Popup-sidepanel-handoff clipboard-tile-handoff-payload rubric

## Latency budgets

- Tile click -> handoff slot write: <= 200ms.
- Sidepanel open + read + clear: <= 600ms end-to-end.

## State expectations

- Step 1: user clicks the popup clipboard tile.
- Step 2: clipboard text + lang-pair + timestamp writes to `pendingPopupHandoff`; popup closes.
- Step 3: sidepanel mounts; reads the slot; clears it from storage; seeds the first UserTurn.

## Visible affordances

- Sidepanel UserTurn carries the clipboard text verbatim + an "from clipboard" marker.

## Failure-mode expectations

- Empty clipboard -> no handoff write; popup stays open with a toast.
- Sidepanel fails to open -> the handoff slot persists until the next sidepanel mount OR TTL drain (~30s).

## Cautions

- The handoff slot is keyed under `pendingPopupHandoff`; do not double-key per surface — there is ONE channel.
- The clipboard text must NOT persist in storage beyond the read-and-clear cycle.
