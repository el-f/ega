# Tooltip image-inline rubric

## Latency budgets

- Image-translate result first paint: <= 800ms (image decode + OCR overhead).
- Source image render: <= 300ms after `imageUrl` set.

## State expectations

- Step 1: a pending message mounts a loading tooltip showing the source image and "Reading text from image…"; the result reopens it with the body.
- Step 2: the source image renders above the result body; natural aspect preserved.
- Step 3: result body shows only the translated text (no separate OCR text).

## Visible affordances

- Close-X is present on image tooltips regardless of `clickOutsideDismiss`; Esc and click-outside also close them.
- Explain action is HIDDEN.

## Failure-mode expectations

- Error result -> no thumbnail renders; the body shows "<error label>: <message>" in danger tone (e.g. "Cannot use this image: …").
- OCR text empty -> body shows "No translation came back. Click Retry, or check the model in Settings → Backends."

## Cautions

- The source image is capped at 240px high and the tooltip width (object-fit: contain); it has no lazy loading or fixed size.
- Retry sends a new vision request for the same image URL; the image is fetched again.
