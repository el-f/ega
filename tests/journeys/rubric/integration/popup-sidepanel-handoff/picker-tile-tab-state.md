# Popup-sidepanel-handoff picker-tile-tab-state rubric

## Latency budgets

- Pick element click -> picker overlay mounts on active tab: <= 400ms.
- Popup window close: <= 200ms.

## State expectations

- Step 1: popup is mounted with Pick element enabled.
- Step 2 (click): `picker:enter` dispatches to the active tab; popup window closes.
- Step 3: the picker overlay is mounted on the page; the popup state is gone.

## Visible affordances

- The popup window closes immediately, before the picker overlay paints — the user expects the popup gone.

## Failure-mode expectations

- Active tab is a restricted scheme -> Pick element is aria-disabled and the status line says "Ega can't run on this page." It is also aria-disabled, with "Off in Settings", when the picker is off.
- Picker mount fails silently in the content script -> the popup's `chrome.runtime.sendMessage` did not throw; the failure is invisible until the user notices the picker didn't appear.

## Cautions

- Closing the popup is a UX commitment — the picker is a tab-level affordance, not a popup-level one.
- The popup must NOT wait for the picker mount acknowledgment before closing — it's fire-and-forget.
