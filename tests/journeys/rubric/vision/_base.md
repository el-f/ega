# Vision family rubric

## Cross-surface invariants

- Image artifacts (source crop, OCR-detected boxes) never leak across surfaces. A tooltip image-translate result is local to that tooltip; the sidepanel receives its own copy via explicit handoff.
- Source-image natural aspect is preserved across renders — no fixed-height squash, no width clip.
- OCR text must surface verbatim alongside the translation; the user has to be able to copy the source string.
- The picker overlay is page-scoped — it cannot intercept input on the extension surfaces.

## Routing

- Vision tasks use the same backend chain as text translate; the user sees one composed result.
- Page-translate batches paragraphs; per-paragraph errors degrade gracefully (the failing paragraph stays in source language; the page is not torn down).

## Safety

- Picker rejects sensitive targets (password inputs, hidden controls) and stays on so the user can pick again.
- Inline-replace edits respect contentEditable boundaries — never mutate read-only DOM.
