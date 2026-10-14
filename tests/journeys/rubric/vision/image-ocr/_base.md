# Image-OCR surface rubric

## Mount + position

- Image-translate tooltip mounts within 400ms of the user invoking the action; the source image renders above the result body.
- Source image natural aspect is preserved (no fixed-height squash).

## Result shape

- The result body shows only the translation as a plain string; the OCR'd source text is not shown.
- The tooltip's Explain button is HIDDEN when `imageUrl` is set — an image result has no source text to explain.

## Error path

- Failure shows `<code label>: <message>` in the tooltip body in the danger tone; the source image is removed in the error state.

## Sidepanel handoff

- Open in side panel lands a finished pair: a user turn with the image and an assistant turn with the translation.
