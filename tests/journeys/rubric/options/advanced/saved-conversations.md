# Options-advanced saved-conversations rubric

## Latency budgets

- Data sub-tab open -> list rows visible: <= 300ms.
- Delete confirmed -> row gone and an open side panel empty: <= 1s.

## State expectations

- Step 1: Advanced -> Data shows "Saved conversations", one row per site that has turns, newest first. Each row names the site ("Other pages" for pages with no site), the last update time and the size.
- Step 2: Delete on a row asks first. On confirm every turn of that thread is buried, so an open side panel on that site empties and its next save does not write the turns back. The row leaves the list.
- Step 3: "Clear all conversations" asks first, then removes every thread and the index. An open side panel empties, as it does for Delete all data. The list shows "No saved conversations".

## Visible affordances

- Delete is a small danger icon button named "Delete the conversation for <site>"; Clear all is a danger button under the list.
- Settings search finds the card under "Saved conversations".

## Failure-mode expectations

- A cancelled confirm changes nothing.
- A failed delete shows a danger toast and the list re-reads storage.

## Cautions

- Settings, API keys, the glossary and the audit log are untouched by both actions.
