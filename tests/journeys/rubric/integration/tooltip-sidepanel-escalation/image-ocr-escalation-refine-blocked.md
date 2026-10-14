# Tooltip-sidepanel-escalation image-ocr-escalation-refine-blocked rubric

## Latency budgets

- Image OCR Open-in-sidepanel click -> seeded image turn visible: <= 800ms.

## State expectations

- Step 1: image OCR tooltip completes; user clicks Open-in-sidepanel.
- Step 2: sidepanel mounts with the image turn seeded — the image in the UserTurn, the tooltip's answer in the AssistantTurn.
- Step 3: the image reply's Refine menu holds only the language items: no presets and no "Describe a change…". No "Try again" button is present on a finished reply.

## Visible affordances

- The seeded image turn renders the source image thumbnail above the OCR/translated body.
- The standard action row (Copy, Regenerate, Refine and More) still renders; More's "Answer again as" lists only the tasks that read images.

## Failure-mode expectations

- A preset or "Describe a change…" on an image reply is a regression — the test must fail.

## Cautions

- Image replies take no text refinement by design (no text source to re-route through a refine prompt); they can still be answered in another language.
- The image on the seeded message (or its kind `image-translate`) removes the presets; the test must verify the seeded turn carries it.
- Copy may still be present on the image reply; only the text presets are left out.
