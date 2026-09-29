# Image-OCR image-aspect-preserved rubric

## Latency budgets

- N/A — this is a layout contract.

## State expectations

- Step 1: image-translate tooltip renders the source image above the body.
- Step 2: the image's natural aspect ratio is preserved — no fixed-height squash, no width crop.
- Step 3: on narrow tooltips, the image scales DOWN proportionally with a max-width clamp; never wider than the tooltip body.

## Visible affordances

- Explicit width/height attributes prevent CLS (cumulative layout shift) during decode.

## Failure-mode expectations

- Extreme aspect ratios (e.g., a 1:20 banner) clamp to a sensible max-height (~400px) with the image fitting inside via `object-fit: contain`.

## Cautions

- Use `aspect-ratio` CSS or explicit width/height — never JS-based recalculation per resize.
- A 1x1 placeholder PNG must NOT be treated as a valid image (degenerate cases hide the image element).
