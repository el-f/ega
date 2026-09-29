# Tooltip copy-button rubric

## Latency budgets

- First paint after selection: <= 350ms.
- Click copy -> clipboard ack: <= 200ms.

## State expectations

- Step 1: tooltip mounted with translation text visible.
- Step 2 (click copy): toast or pill feedback appears within 100ms; clipboard actually contains the translation.
- Step 3 (after ~1.5s): feedback dismissed; tooltip remains anchored.

## Visible affordances

- Copy button labeled or `aria-label="Copy"`.
- Hover state visible.
- Disabled state when translation is still streaming.

## Failure-mode expectations

- Clipboard permission denied -> inline error inside tooltip (not a silent failure, not a toast that vanishes before the user reads it).

## Cautions

- Copy button must NOT steal focus from the page. The tooltip body must NOT jump on copy.
- The button should not be in the tab order BEFORE the primary translation text — keyboard users read first, copy second.
