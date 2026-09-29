# Tooltip image-inline rubric

## Latency budgets

- Image-translate result first paint: <= 800ms (image decode + OCR overhead).
- Source image render: <= 300ms after `imageUrl` set.

## State expectations

- Step 1: image-translate result chunk lands with `imageUrl` set on the tooltip.
- Step 2: the source image renders above the result body; natural aspect preserved.
- Step 3: result body lists the OCR text + translation; both are user-readable strings.

## Visible affordances

- Close-X is present regardless of `clickOutsideDismiss` (image surfaces have no other escape).
- Explain action is HIDDEN.

## Failure-mode expectations

- Source image decode failure -> hide the broken `<img>` element; replace body with a danger-toned error message ("Couldn't decode image").
- OCR text empty -> body surfaces "No text detected in image" rather than an empty body.

## Cautions

- The source image must use `loading="lazy"` and explicit width/height to prevent CLS during the layout.
- The image must NOT be re-uploaded on a retry — cache the blob for the duration of the tooltip.
