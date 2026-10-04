# Popup-sidepanel-handoff surface rubric

## Channel

- The handoff queue is keyed under `ega.pendingPopupHandoff` in `chrome.storage.session`; each entry carries sourceText, sourceLang, targetLang, task, tone and `ts`; `windowId` is stamped when known but is optional, and an entry with none drains to whichever panel asks first.
- The slot is drained by the sidepanel on read; second open of the sidepanel never re-reads the same payload.

## Cold vs warm

- Cold-start sidepanel reads the slot on mount and seeds the first turn.
- Warm sidepanel (already open) drains the queue on `storage.onChanged` (session area); there is no runtime message.

## Staleness

- A payload older than 60s is ignored on read; the sidepanel mounts in its default state.

## Surface-specific

- Popup body carries `data-ega-popup` (empty value); the body is 360px wide and the popover scrim clamps to that width.
- Picker / Page tiles operate on the active tab; the popup window closes after dispatch.
