# Page-translate esc-restores-all rubric

## Latency budgets

- Esc keypress -> all wrappers + replacements removed: <= 200ms across hundreds of paragraphs.

## State expectations

- Step 1: page has multiple translated paragraphs wrapped / replaced inline.
- Step 2 (press Esc): every wrapper is removed; every inline-replaced paragraph is restored to its original text.
- Step 3: the page is indistinguishable from its pre-translate state.

## Visible affordances

- Esc dispatches synchronously; the user sees the restoration in one frame.

## Failure-mode expectations

- A wrapper that was DOM-mutated by the page after wrap (e.g., the page re-rendered the paragraph) may be untouchable — the restore logs a debug warning but does not throw.
- Partial restore on error -> the rest of the wrappers still clear; one stuck wrapper does not block the rest.

## Cautions

- Restore must NOT trigger page reflow per wrapper — batch the DOM mutations into a single layout pass.
- The restore buffer must survive page mutations between translate and restore — store original text in a JS Map, not in DOM attributes the page might clobber.
