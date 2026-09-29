# Tooltip-sidepanel-escalation image-ocr-tooltip-then-sidepanel rubric

## Latency budgets

- "Open in side panel" click -> sidepanel mount with seeded image + text: <= 1s.

## State expectations

- Step 1: image-OCR tooltip is finalized with source image + OCR text + translation.
- Step 2 (click "Open in side panel"): tooltip dismisses; sidepanel opens with a seed conversation carrying the image + OCR text + translation as the first UserTurn / AssistantTurn pair.
- Step 3: the user can ask follow-ups; the image is preserved as context.

## Visible affordances

- The seeded UserTurn shows the image thumbnail + OCR text; the AssistantTurn shows the translation.
- An advisory chip marks the conversation as "from image OCR".

## Failure-mode expectations

- The image blob must transfer to the sidepanel — typically via `chrome.runtime` with a transferable.
- If transfer fails, the sidepanel mounts with the OCR text only; the image is missing with an inline notice.

## Cautions

- The image must NOT be re-OCR'd by the sidepanel — reuse the existing OCR text.
- The image data must NOT be persisted in storage; it lives only in-memory for the sidepanel session.
