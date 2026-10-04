# Popup freeform-send-handoff rubric

## Latency budgets

- Send click -> sidepanel opens: <= 400ms.
- Popup dismiss after handoff: <= 200ms.

## State expectations

- Step 1: popup composer carries user-typed text.
- Step 2 (Send): handoff payload (text + tone + lang-pair) written to the `pending-popup-handoff` channel; popup closes; sidepanel opens with the user turn already populated and streaming.
- Step 3: the composer is empty on next open (a successful send clears the saved draft; a trimmed send keeps it).

## Visible affordances

- Send button matches sidepanel send affordance (consistency).
- Handoff is a single atomic action — no intermediate "Opening sidepanel..." spinner inside the popup.

## Failure-mode expectations

- If the sidepanel fails to open (extension API error), the popup stays open with a "Could not open the side panel." toast and the composer text is kept.
- A handoff the sidepanel never drains expires after 60s, so a panel opened later does not replay it.

## Cautions

- Do NOT translate in the popup itself. The popup is a launcher.
- Do NOT lose the user's text if the handoff fails — leave the composer populated.
