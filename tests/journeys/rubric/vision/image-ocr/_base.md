# Image-OCR surface rubric

## Mount + position

- Image-translate tooltip mounts within 400ms of the user invoking the action; the source image renders above the result body.
- Source image natural aspect is preserved (no fixed-height squash).

## Result shape

- The result body carries OCR text plus the translation; both are user-readable strings, not opaque blobs.
- The Explain action is HIDDEN when `imageUrl` is set — image surfaces don't host follow-up explain chains.

## Error path

- Failure surfaces an inline error pill inside the tooltip; the source image stays (so the user knows what was sent), the body text is replaced.

## Sidepanel handoff

- Open-in-sidepanel preserves the image + OCR text + translation as the seed conversation turn.
