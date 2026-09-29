# Snippets edit-body-persists rubric

## Latency budgets

- Keystroke -> storage write (debounced): <= 300ms after last keystroke.

## State expectations

- Step 1: user clicks into a snippet body textarea.
- Step 2: typing updates the body; a debounced write commits to storage.
- Step 3: navigation away preserves the body; refresh recovers it.

## Visible affordances

- A subtle "Saved" ack flashes after the debounced write.
- During typing, no commit indicator (avoid distracting per-keystroke flicker).

## Failure-mode expectations

- A debounced write that lands while the user is still typing must batch — never overlap two pending writes.
- Storage write failure surfaces an inline error icon; the user is warned before navigation.

## Cautions

- Per-keystroke persistence is the explicit semantics for snippets ONLY — other template surfaces require explicit Save.
- Debounce window must be tight enough that data loss on rapid navigation is unlikely (~300ms).
