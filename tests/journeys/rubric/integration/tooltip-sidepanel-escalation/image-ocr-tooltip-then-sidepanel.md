# Tooltip-sidepanel-escalation image-ocr-tooltip-then-sidepanel rubric

## Latency budgets

- "Open in side panel" click -> sidepanel mount with seeded image + text: <= 1s.

## State expectations

- Step 1: image-OCR tooltip is finalized with source image + OCR text + translation.
- Step 2 (click "Open in side panel"): tooltip closes; sidepanel opens and appends a delivered pair: UserTurn with the image, AssistantTurn with the tooltip's answer.
- Step 3: the user can ask follow-ups; the image is preserved as context.

## Visible affordances

- The seeded UserTurn shows the image thumbnail only; the AssistantTurn shows the tooltip's answer.

## Failure-mode expectations

- The image URL travels in the `ui:open-sidepanel` handoff; the SW writes it to `ega.pendingPopupHandoff` (storage.session) and the panel drains it.
- An image over the size cap is dropped from the handoff and a warning toast says so; with no image left, the panel seeds a delivered turn using the tooltip's OCR answer, never sending the `[image]` placeholder as a new request.

## Cautions

- The image must NOT be re-OCR'd by the sidepanel — reuse the existing OCR text.
- The image is saved with the thread like any image turn; one over the size cap is replaced by placeholder text.
