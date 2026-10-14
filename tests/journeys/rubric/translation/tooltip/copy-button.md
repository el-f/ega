# Tooltip copy-button rubric

## Latency budgets

- First paint after selection: <= 350ms.
- Click copy -> clipboard ack: <= 200ms.

## State expectations

- Step 1: tooltip mounted with translation text visible.
- Step 2 (click copy): the copy icon flips to a check, its hint reads "Copied", a screen-reader live region announces "Copied"; clipboard contains the translation.
- Step 3 (after ~1.5s): feedback dismissed; tooltip remains anchored.

## Visible affordances

- Copy button has `aria-label="Copy translation"` ("Copy partial translation" on an error with partial text).
- Hover state visible.
- No copy button before the first token; once text streams in, copy is enabled and copies the text so far.

## Failure-mode expectations

- Clipboard write failure is swallowed: no error shows and the icon does not flip to the check.

## Cautions

- Copy button must NOT steal focus from the page. The tooltip body must NOT jump on copy.
- The button should not be in the tab order BEFORE the primary translation text — keyboard users read first, copy second.
