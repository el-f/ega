# Sidepanel image-turn-no-refine-chips rubric

## Latency budgets

- Image-translate reply completes -> its Refine menu can be checked within 200ms of stream end.

## State expectations

- Step 1: an external image-translate turn reaches the side panel (seeded or by direct image OCR dispatch); the message carries the image (`imageDataUrl`) and the reply completes.
- Step 2: the reply's action row is inspected right after completion: Copy, Regenerate, Refine and More.
- Step 3: the Refine menu holds only the language items ("Translate into another language…", and "Translate into {X}" when the composer target differs). It has no presets and no "Describe a change…", because there is no text to reword.

## Visible affordances

- The source image renders in the message bubble (`.ega-imgprev img`), not just the OCR text.
- More holds "Answer again as" with only the tasks that read images, then Bookmark and Delete.
- Regenerate is present: the seed records a dispatch on the message, so the image pass can re-run.

## Failure-mode expectations

- A preset or "Describe a change…" on an image reply is a regression — the test must fail explicitly.
- A missing Regenerate on a seeded image reply is also a regression.

## Cautions

- The image check keys on the image on the message (`imageDataUrl`), never on the turn kind: an Explain-with-image send carries an image under kind `explain`.
- There is no Swap item on an image reply: an image has no source language to swap from.
