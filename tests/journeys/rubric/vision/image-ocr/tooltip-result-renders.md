# Image-OCR tooltip-result-renders rubric

## Latency budgets

- `image-translate-result` chunk landing -> tooltip mount with image: <= 400ms.
- Source image decode + render: <= 600ms.

## State expectations

- Step 1: backend completes the image-translate task; the result message carries `imageUrl` + translation (+ confidence, detected language).
- Step 2: the loading tooltip mounted on pending (image shimmer + Cancel) closes and a new tooltip mounts with the source image on top and the result body under it.
- Step 3: result body shows only the translation as selectable text; the Copy button copies it.

## Visible affordances

- Close-X is present regardless of `clickOutsideDismiss`.
- Image has no width/height attributes; CSS clamps it to max-width 100% / max-height 240px with `object-fit: contain`.

## Failure-mode expectations

- Image load failure -> the translation body still renders below; the `<img>` is not removed.

## Cautions

- Image must use the original blob — no client-side downscale that loses OCR fidelity.
- Retry re-dispatches `image:translate` with the same `imageUrl` under a new id; the vision call runs again.
