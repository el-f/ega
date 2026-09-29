# Popup open-side-panel rubric

## Latency budgets

- Panel tile click -> sidepanel opens: <= 500ms.
- Popup close: <= 200ms after dispatch.

## State expectations

- Step 1: popup is mounted with the panel tile enabled.
- Step 2 (click tile): `chrome.sidePanel.open()` (or analogous API) fires; popup closes; sidepanel mounts.
- Step 3: sidepanel is mounted in its default state OR with the popup's pending handoff payload (if one is pending).

## Visible affordances

- Tile is enabled regardless of the user's setup state — opening the panel is always allowed.
- Tile has a label + icon; never icon-only.

## Failure-mode expectations

- Sidepanel API unavailable (e.g., older Chrome) -> tile is disabled with explanatory tooltip.

## Cautions

- Opening the sidepanel without a handoff payload mounts it clean — no stale prefill from a previous session.
- If the sidepanel is already open, the tile becomes a no-op visually but still focuses / brings the panel forward.
