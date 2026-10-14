# Image-OCR image-aspect-preserved rubric

## Latency budgets

- N/A — this is a layout contract.

## State expectations

- Step 1: image-translate tooltip renders the source image above the body.
- Step 2: the image's natural aspect ratio is preserved — no fixed-height squash, no width crop.
- Step 3: on narrow tooltips, the image scales DOWN proportionally with a max-width clamp; never wider than the tooltip body.

## Visible affordances

- The image has no width/height attributes; CSS max-width 100% and max-height 240px bound it.

## Failure-mode expectations

- Extreme aspect ratios (e.g., a 1:20 banner) clamp to max-height 240px with the image fitting inside via `object-fit: contain`.

## Cautions

- Sizing is CSS only (max-width 100%, max-height 240px, `object-fit: contain`) — no JS recalculation per resize.
