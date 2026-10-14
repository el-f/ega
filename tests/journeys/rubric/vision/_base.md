# Vision family rubric

## Cross-surface invariants

- Image results (source image and answer) never leak across surfaces. A tooltip image-translate result is local to that tooltip; the sidepanel receives its own copy via explicit handoff.
- Source-image natural aspect is preserved across renders — no fixed-height squash, no width clip.
- The vision answer holds only the translation; the extracted source text is not shown separately.
- The picker overlay is page-scoped — it cannot intercept input on the extension surfaces.

## Routing

- Vision requests use the task's chain (translate, or explain for Explain-with-image) filtered to image-capable backends; with none, a caption-less or menu image fails with "No backend that reads images is set up...", a captioned side-panel image falls back to the text path.
- Page-translate batches paragraphs; per-paragraph errors degrade gracefully (the failing paragraph stays in source language; the page is not torn down).

## Safety

- Picker rejects sensitive targets (password, card and one-time-code fields, editable text) with a toast and stays on so the user can pick again.
- Inline-replace edits respect contentEditable boundaries — never mutate read-only DOM.
