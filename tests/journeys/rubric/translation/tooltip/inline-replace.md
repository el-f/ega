# Tooltip inline-replace rubric

## Latency budgets

- Stream completion -> source text swap: <= 200ms.
- Esc -> source text restoration: <= 200ms.

## State expectations

- Step 1: tooltip is configured with `displayMode === 'inline-replace'`; the translate begins as normal.
- Step 2: on stream completion, the source selection in the page is replaced by the translation text in place.
- Step 3 (Esc OR explicit Restore): the original source text is restored verbatim at the same DOM position.

## Visible affordances

- A subtle marker / underline indicates the replaced text so the user knows it was modified.
- The tooltip dismisses on successful replacement; a toast offers Restore.

## Failure-mode expectations

- ContentEditable boundaries are honored — never write into a read-only DOM node.
- Backend failure -> no replacement happens; the source text is untouched.

## Cautions

- Inline-replace must NOT lose the original text. The restore-buffer is kept in memory until the user navigates away.
- Multiple inline-replaces on the same page must each be individually restorable.
