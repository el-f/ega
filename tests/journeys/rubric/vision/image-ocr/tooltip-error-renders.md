# Image-OCR tooltip-error-renders rubric

## Latency budgets

- Error chunk landing -> error pill visible inside tooltip: <= 200ms.

## State expectations

- Step 1: backend image-translate fails (network, quota, OCR failure).
- Step 2: the loading tooltip is replaced by an error tooltip at the same spot; the source image is removed; the body shows `<code label>: <message>` in the danger tone.
- Step 3: Retry shows for retryable codes (and ABORTED); an "Open settings" button shows when the error maps to a settings tab; close-X stays.

## Visible affordances

- Error body uses the danger tone; the image is not rendered in the error state.

## Failure-mode expectations

- Any vision failure -> `<code label>: <message>`, Retry when the code is retryable; no half-rendered placeholder.

## Cautions

- The error message must be plain language ("Couldn't process image"), never a raw HTTP code.
- The error path must NOT auto-retry the image upload; user retries explicitly.
