# Popup open-side-panel rubric

## Latency budgets

- Open side panel click -> sidepanel opens: <= 500ms.
- Popup close: <= 200ms after dispatch.

## State expectations

- Step 1: popup is mounted with Open side panel enabled.
- Step 2 (click Open side panel): `chrome.sidePanel.open()` (or analogous API) fires; popup closes; sidepanel mounts.
- Step 3: sidepanel is mounted in its default state OR with the popup's pending handoff payload (if one is pending).

## Visible affordances

- Open side panel is enabled regardless of the user's setup state — opening the panel is always allowed.
- The row has a label + icon; never icon-only.

## Failure-mode expectations

- Sidepanel open fails -> the popup stays open with a "Ega couldn't open the side panel. Try again." toast.

## Cautions

- Opening the sidepanel without a handoff payload mounts it clean — no stale prefill from a previous session.
- If the sidepanel is already open, the row becomes a no-op visually but still focuses / brings the panel forward.
