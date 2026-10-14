# Sidepanel open-settings rubric

## Latency budgets

- Settings pick -> Options tab opens: <= 400ms.

## State expectations

- Step 1: the header's More menu lists "Settings" after "Keyboard shortcuts"; the header itself has no cog.
- Step 2 (Settings): `chrome.runtime.openOptionsPage()` fires; a new tab opens with the Options shell mounted.
- Step 3: the side panel stays mounted; the conversation is unchanged.

## Visible affordances

- The More button is named "More" with a matching tooltip; the menu opens on click, Enter, Space or ArrowDown and Settings is reachable with the arrow keys.

## Failure-mode expectations

- An extension API failure shows a toast ("Could not open Settings. Open chrome://extensions, pick Ega, then Details."); the item is never silently dead.

## Cautions

- Opening Settings must NOT close the side panel: the user expects to return to their conversation.
