# Options-shell label-swap-no-layout-shift rubric

## Latency budgets

- Test now click -> "Stop" label: <= 1 frame.
- Mocked answer -> "Answered in" line and the idle label: <= 200ms after the reply lands.

## State expectations

- Step 1: the backend card is open; the button reads "Test now".
- Step 2 (click): the same button reads "Stop"; "Testing..." with a spinner shows beside it.
- Step 3: the button reads "Test now" again; "Answered in" shows beside it.

## Visible affordances

- The button keeps one size in every state: it fits its widest label.
- No button in the card moves or resizes by more than 1 px across the three states.
- The status text sits in a slot that flexes; the button stays pinned.

## Failure-mode expectations

- A failed test shows its error under the row; the row itself does not move.

## Cautions

- The probe reads offset boxes, not viewport boxes: Playwright scrolls before a click.
- A label swap changes the text of one element; it never swaps in a new element.
