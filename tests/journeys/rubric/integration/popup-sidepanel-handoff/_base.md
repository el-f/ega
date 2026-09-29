# Popup-sidepanel-handoff surface rubric

## Channel

- The handoff is keyed under `pendingPopupHandoff` in `chrome.storage.local`; it carries text + tone + lang-pair + timestamp.
- The slot is drained by the sidepanel on read; second open of the sidepanel never re-reads the same payload.

## Cold vs warm

- Cold-start sidepanel reads the slot on mount and seeds the first turn.
- Warm sidepanel (already open) receives the payload via `chrome.runtime` message; no storage round-trip required for warm-handoff.

## Staleness

- A payload older than 60s is ignored on read; the sidepanel mounts in its default state.

## Surface-specific

- Popup body carries `data-ega-popup="true"`; the overlay clamps to a 360px column under this attribute.
- Picker / Page tiles operate on the active tab; the popup window closes after dispatch.
