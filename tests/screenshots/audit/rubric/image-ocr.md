# Image-translate (OCR) surface rubric

Image-translate UI splits across tooltip and sidepanel surfaces depending on `imageTranslateSurface`. The tooltip variant is single-shot (buffered then emitted at done); the sidepanel variant streams chunks like normal text translation.

## Invariants

- Tooltip variant: `<img class="tooltip-image-source">` mounts ABOVE the translation body. Natural aspect ratio preserved (no height squash).
- Confidence pill, when shown, sits in the meta footer INSIDE the card radius. Image-inline + short body is a known tight layout — pill must NOT poke past the rounded corner.
- Sidepanel variant: seed advisory then streamed chunks; standard assistant-turn skeleton.
- Explain action is HIDDEN when `imageUrl` is set on the tooltip (image-OCR doesn't support follow-up explain).

## States

- **loading** — sidepanel surface mid-stream; SSE held; cursor visible inside the assistant body.
- **result** — tooltip surface with image header + filled translation body + confidence pill.

## Severity overrides

- Confidence pill overlapping the card's rounded corner is **major** overflow (regressed once; pinned).
- Image squashed to a non-natural aspect is **major** primitive_coherence.
- Explain action visible on an image-translate tooltip is **major** primitive_coherence.
- Sidepanel loading without the streaming skeleton is **major** hierarchy.
