# Popup open-picker rubric

## Latency budgets

- Pick tile click -> picker overlay mounts on active tab: <= 400ms.
- Popup close: <= 200ms after dispatch.

## State expectations

- Step 1: popup is mounted with the pick tile enabled.
- Step 2 (click tile): `picker:enter` message is dispatched to the active tab; popup closes; picker overlay mounts on the page.
- Step 3: user can pick an element on the page; picker exits on click or Esc per the vision/picker rubric.

## Visible affordances

- Tile is disabled with a tooltip when the active tab is a restricted scheme (chrome://, edge://, file://) where content scripts cannot inject.

## Failure-mode expectations

- Picker fails to mount (content script not loaded) -> popup surfaces an inline notice on next open; the failed dispatch is not silently lost.

## Cautions

- The tile must close the popup window even if the picker mount is async — the user expects the popup gone immediately after click.
- The picker overlay lives in the active tab's content; the popup has no visibility into picker state.
