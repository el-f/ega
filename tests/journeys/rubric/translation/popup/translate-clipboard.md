# Popup translate-clipboard rubric

## Latency budgets

- Tile click -> clipboard read attempt: <= 100ms.
- Clipboard read success -> side panel opens with text streaming: <= 600ms.

## State expectations

- Step 1: popup shows the "Translate clipboard" tile, enabled.
- Step 2 (click tile): clipboard is read; if non-empty, handoff fires + popup closes; side panel opens streaming.
- Step 3: the side panel user turn carries the clipboard text verbatim (no normalization that drops formatting).

## Visible affordances

- Tile is always enabled; the click asks Chrome for clipboard access when it is not yet granted.
- After grant, the same click goes on to read the clipboard — no second click or reload.

## Failure-mode expectations

- Empty clipboard: tile click surfaces a non-blocking toast ("Clipboard is empty"). No popup close.
- Permission denied: a toast says "Clipboard access was denied — click the tile again and choose Allow."

## Cautions

- The clipboard text must not be stored anywhere persistent. This is a one-shot read.
- Clipboard text over 2000 characters is cut to the first 2000 and sent; a toast says so and the popup stays open.
