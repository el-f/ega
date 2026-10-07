# Sidepanel drop-text rubric

## Latency budgets

- Drop event -> composer text update: <= 100ms.

## State expectations

- Step 1: user drags plain text from an external source over the composer.
- Step 2 (drop): if the composer is empty, the dropped text replaces the value. If non-empty, the dropped text appends with a `\n` separator.
- Step 3: composer regains focus at the end of the appended text.

## Visible affordances

- During dragover the input box gets a dashed accent outline and a soft accent fill; nothing moves.
- Send stops being `aria-disabled` once the composer has non-whitespace content.

## Failure-mode expectations

- Whitespace-only drop on an empty composer replaces but stays whitespace-only; Send stays unavailable.
- Drop with both image and text payload: image wins (single-attach v0); text is discarded and a toast says so.

## Cautions

- Drop must NOT auto-send. The user must explicitly press Send or Enter.
- Drop must trim trailing whitespace on the existing value before appending — no `\n \nfoo` artifacts.
