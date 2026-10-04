# Tooltip-sidepanel-escalation image-ocr-escalation-refine-blocked rubric

## Latency budgets

- Image OCR Open-in-sidepanel click -> seeded image turn visible: <= 800ms.

## State expectations

- Step 1: image OCR tooltip completes; user clicks Open-in-sidepanel.
- Step 2: sidepanel mounts with the image turn seeded — the image in the UserTurn, the tooltip's answer in the AssistantTurn.
- Step 3: NO quick-refine chips render below the image AssistantTurn; NO retry button is present.

## Visible affordances

- The seeded image turn renders the source image thumbnail above the OCR/translated body.
- The turn footer has no chip row; the standard action row (copy, regenerate, bookmark, delete) still renders.

## Failure-mode expectations

- If refine chips accidentally appear on an image turn, that is a regression — the test must fail.

## Cautions

- Image turns are non-refinable by design (no text-only source input to re-route through a refine prompt).
- The seeded turn's kind `image-translate` (or an image on its user turn) suppresses chips; test must verify the seeded turn carries it.
- Copy button may still be present on the image turn; only refine chips and the retry button are suppressed.
