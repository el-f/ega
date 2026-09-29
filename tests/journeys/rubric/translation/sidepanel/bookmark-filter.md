# Sidepanel bookmark-filter rubric

## Latency budgets

- Menu pick or Show all click -> filtered stream: <= 100ms.

## State expectations

- Step 1: the header shows one row; the bookmark filter lives in the More (⋯) menu.
- Step 2 (pick "Show bookmarked only"): the menu closes, a bar under the header says how many messages are bookmarked, and the stream shows only bookmarked exchanges (or an empty hint).
- Step 3 (click "Show all"): the bar goes away and the full thread returns.

## Visible affordances

- The menu item is a checkbox item and shows a check while the filter is on.
- The bar's "Show all" is visible without opening the menu again.

## Failure-mode expectations

- A filter left on is never invisible: the bar stays up for as long as the filter is on.

## Cautions

- Sending a new message turns the filter off, so the new exchange is never hidden.
