# Sidepanel bookmark-filter rubric

## Latency budgets

- Menu pick or Show all click -> filtered stream: <= 100ms.

## State expectations

- Step 1: the header shows one row; the bookmark filter lives in the More (⋯) menu.
- Step 2 (pick "Show bookmarked only"): the menu closes, a bar under the header says how many messages are bookmarked, and the stream shows only bookmarked exchanges (or an empty hint).
- Step 3 (click "Show all"): the bar goes away and the full thread returns.
- Step 4 (a reply's own More menu, then Bookmark): the reply shows a star mark beside its time, and its menu shows Bookmark checked. Bookmark and Delete live in that menu, not in the reply's action row.

## Visible affordances

- The menu item is a checkbox item and shows a check while the filter is on.
- The bar's "Show all" is visible without opening the menu again.

## Failure-mode expectations

- A filter left on stays visible: the bar is up while the filter is on, except while the search bar is open.

## Cautions

- Sending a new message turns the filter off, so the new exchange is never hidden.
