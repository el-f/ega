# Popup-sidepanel-handoff clipboard-tile-handoff-payload rubric

## Latency budgets

- Tile click -> handoff slot write: <= 200ms.
- Sidepanel open + read + clear: <= 600ms end-to-end.

## State expectations

- Step 1: user clicks the popup clipboard tile.
- Step 2: clipboard text + lang pair + task/tone + `ts` queue under `ega.pendingPopupHandoff` (storage.session); side panel opens; popup closes (stays open if the text was trimmed).
- Step 3: sidepanel mounts; reads the slot; clears it from storage; seeds the first UserTurn.

## Visible affordances

- Sidepanel UserTurn carries the trimmed clipboard text; there is no clipboard marker.

## Failure-mode expectations

- Empty clipboard -> no handoff write; popup stays open with a toast.
- Sidepanel fails to open -> "Could not open the side panel." toast; the entry stays queued and a sidepanel mount within 60s drains it.

## Cautions

- The handoff is keyed under `ega.pendingPopupHandoff`, one queue map shared by the popup and SW writers — there is ONE channel.
- The clipboard text must NOT persist in storage beyond the read-and-clear cycle.
