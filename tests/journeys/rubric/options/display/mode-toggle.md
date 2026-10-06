# Options-display mode-toggle rubric

## Latency budgets

- Card click -> active state moves: <= 100ms.

## State expectations

- Step 1: the Answers tab opens with "Where answers show" at the top, Tooltip picked, both option groups visible.
- Step 2: the user picks Inline; the active state moves to it.
- Step 3: `defaultDisplayMode` writes `'inline'`; the tooltip options stay on screen.

## Visible affordances

- Two bordered cards; the active one gets the accent border and a soft accent background.
- Each card has a picture of the mode, a label and one line.

## Failure-mode expectations

- Clicking the already-picked card writes nothing.

## Cautions

- No note like "Inline mode has no settings of its own"; nothing appears or disappears when the mode changes.
