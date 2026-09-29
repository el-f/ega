# Image-OCR tooltip-error-renders rubric

## Latency budgets

- Error chunk landing -> error pill visible inside tooltip: <= 200ms.

## State expectations

- Step 1: backend image-translate fails (network, quota, OCR failure).
- Step 2: tooltip mounts (or stays mounted) with the source image still visible; the body slot carries an error pill with the label.
- Step 3: a retry control is available; close-X remains reachable.

## Visible affordances

- Error pill uses the danger tone tokens; broken-image rect is hidden (image fallback on load failure).
- The OCR text remains visible if the OCR succeeded but translation failed downstream — partial credit.

## Failure-mode expectations

- Both OCR + translation failed -> generic error message with retry; no half-rendered placeholder.

## Cautions

- The error message must be plain language ("Couldn't process image"), never a raw HTTP code.
- The error path must NOT auto-retry the image upload; user retries explicitly.
