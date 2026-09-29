# Popup translate-clipboard rubric

## Latency budgets

- Tile click -> clipboard read attempt: <= 100ms.
- Clipboard read success -> side panel opens with text streaming: <= 600ms.

## State expectations

- Step 1: popup shows the "Translate clipboard" tile, enabled.
- Step 2 (click tile): clipboard is read; if non-empty, handoff fires + popup closes; side panel opens streaming.
- Step 3: the side panel user turn carries the clipboard text verbatim (no normalization that drops formatting).

## Visible affordances

- Tile is disabled with explanatory tooltip when clipboard permission has not been granted.
- After grant, tile becomes enabled — no popup reload required.

## Failure-mode expectations

- Empty clipboard: tile click surfaces a non-blocking toast ("Clipboard is empty"). No popup close.
- Permission denied: tile click surfaces a grant-permission affordance — not just a silent failure.

## Cautions

- The clipboard text must not be stored anywhere persistent. This is a one-shot read.
- If the clipboard is enormous (>50k chars), warn before sending — tokens cost money.
