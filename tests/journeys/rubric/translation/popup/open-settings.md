# Popup open-settings rubric

## Latency budgets

- Gear click -> options page opens in a tab: <= 500ms.

## State expectations

- Step 1: popup is mounted; the header shows a gear button named "Open settings".
- Step 2 (click gear): `chrome.runtime.openOptionsPage()` opens the options page in a tab.
- Step 3: the options shell mounts with its tab list.

## Visible affordances

- The gear is an icon button with an accessible name ("Open settings"); it is reachable by keyboard.

## Failure-mode expectations

- If the options page cannot open, the popup shows an error toast that says how to reach Settings by hand. The click never fails silently.
