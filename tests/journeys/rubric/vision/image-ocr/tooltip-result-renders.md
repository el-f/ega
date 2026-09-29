# Image-OCR tooltip-result-renders rubric

## Latency budgets

- `image-translate-result` chunk landing -> tooltip mount with image: <= 400ms.
- Source image decode + render: <= 600ms.

## State expectations

- Step 1: backend completes the image-translate task; chunk includes `imageUrl` + OCR text + translation.
- Step 2: tooltip mounts with the source image at the top and the result body underneath.
- Step 3: result body shows the OCR text + translation; both are selectable/copyable strings.

## Visible affordances

- Close-X is present regardless of `clickOutsideDismiss`.
- Image carries explicit width/height per natural aspect.

## Failure-mode expectations

- Image load failure -> the `<img>` is hidden; the result body still surfaces the OCR + translation if present.

## Cautions

- Image must use the original blob — no client-side downscale that loses OCR fidelity.
- The image must NOT be sent back to the backend on retries; cache the blob locally.
