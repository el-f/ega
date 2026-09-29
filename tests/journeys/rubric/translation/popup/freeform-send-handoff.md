# Popup freeform-send-handoff rubric

## Latency budgets

- Send click -> sidepanel opens: <= 400ms.
- Popup dismiss after handoff: <= 200ms.

## State expectations

- Step 1: popup composer carries user-typed text.
- Step 2 (Send): handoff payload (text + tone + lang-pair) written to the `pending-popup-handoff` channel; popup closes; sidepanel opens with the user turn already populated and streaming.
- Step 3: the popup composer would be empty on next open (handoff drains the buffer).

## Visible affordances

- Send button matches sidepanel send affordance (consistency).
- Handoff is a single atomic action — no intermediate "Opening sidepanel..." spinner inside the popup.

## Failure-mode expectations

- If the sidepanel fails to open (extension API error), the popup stays open with an inline error and the composer text is preserved.
- The handoff channel must not buffer if the sidepanel never opens — drain on TTL (~30s).

## Cautions

- Do NOT translate in the popup itself. The popup is a launcher.
- Do NOT lose the user's text if the handoff fails — leave the composer populated.
