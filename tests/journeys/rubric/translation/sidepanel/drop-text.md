# Sidepanel drop-text rubric

## Latency budgets

- Drop event -> composer text update: <= 100ms.

## State expectations

- Step 1: user drags plain text from an external source over the composer.
- Step 2 (drop): if the composer is empty, the dropped text replaces the value. If non-empty, the dropped text appends with a `\n` separator.
- Step 3: composer regains focus at the end of the appended text.

## Visible affordances

- A visible drop-zone outline appears during dragover; uses motion tokens.
- The send button enables once the composer has non-whitespace content.

## Failure-mode expectations

- Whitespace-only drop on an empty composer replaces but stays whitespace-only; send remains disabled.
- Drop with both image and text payload: image wins (single-attach v0); text is discarded with an inline notice.

## Cautions

- Drop must NOT auto-send. The user must explicitly click send / Enter.
- Drop must trim trailing whitespace on the existing value before appending — no `\n \nfoo` artifacts.
