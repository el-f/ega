# Image-OCR explain-action-hidden rubric

## Latency budgets

- N/A — this is a render-gate contract.

## State expectations

- Step 1: image-translate tooltip is mounted with `imageUrl` set.
- Step 2: the Explain chip / action is HIDDEN — no DOM element, no `display: none` reservation.
- Step 3: text-translate tooltips (no `imageUrl`) continue to render the Explain action normally.

## Visible affordances

- N/A — the affordance is the absence.

## Failure-mode expectations

- A bug that renders Explain on an image tooltip is treated as a major — an image result has no source text to explain.

## Cautions

- The gate is `tip.imageUrl != null`. Changes to the tooltip shape that introduce a new "image-ish" property must update this gate.
- The side panel does not hide it: an image turn's task menu still offers Translate and Explain (IMAGE_TASKS).
