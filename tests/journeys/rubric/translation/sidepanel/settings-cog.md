# Sidepanel settings-cog rubric

## Latency budgets

- Cog click -> Options tab opens: <= 400ms.

## State expectations

- Step 1: sidepanel header carries a settings cog icon.
- Step 2 (click cog): `chrome.runtime.openOptionsPage()` fires; a new tab opens with Options shell mounted.
- Step 3: sidepanel remains mounted; conversation state preserved.

## Visible affordances

- Cog carries an aria-label "Open settings"; hover state matches other icon buttons in the header.

## Failure-mode expectations

- Extension API failure surfaces a toast ("Could not open Settings. Open chrome://extensions, pick Ega, then Details."); the cog is not silently dead.

## Cautions

- Cog must NOT dismiss the sidepanel — the user expects to return to their conversation.
- Cog must NOT carry a notification dot unless a real notification exists; consistency with the popup chip.
