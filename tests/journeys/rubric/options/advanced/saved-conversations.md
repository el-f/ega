# Options-advanced saved-conversations rubric

## Latency budgets

- Data sub-tab open -> list rows visible: <= 300ms.
- Delete confirmed -> row gone and an open side panel empty: <= 1s.

## State expectations

- Step 1: Advanced -> Data shows "Saved conversations" with the line "Side panel conversations kept on this computer, one per site": one row per site that has turns, newest first. Each row names the site ("Other pages" for pages with no site), the last update time and the size.
- Step 2: the trash button on a row asks "Delete this conversation?" first. On confirm every turn of that thread is buried, so an open side panel on that site empties and its next save does not write the turns back. The row leaves the list.
- Step 3: "Delete all" in the card header asks "Delete all conversations?" first, then removes every thread and the index. An open side panel empties, as it does for Delete all data. The list shows "No saved conversations".

## Visible affordances

- Delete is a trash IconButton named "Delete conversation for <site>"; Delete all is a secondary button in the card header, hidden while the list is empty.
- Settings search finds the card under "Saved conversations".

## Failure-mode expectations

- A cancelled confirm changes nothing.
- A failed delete shows a danger toast with Try again, and the list re-reads storage.

## Cautions

- Settings, API keys, the glossary and the request list are untouched by both actions.
- Both actions ask first because there is no Undo for a deleted conversation yet.
