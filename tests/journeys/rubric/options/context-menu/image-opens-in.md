# Options right-click menu image-opens-in rubric

## Latency budgets

- Radio change -> `contextMenuItems` write: <= 300ms.

## State expectations

- Step 1: the Answers tab's "Where answers show" card has no "Image translation opens in" select.
- Step 2: Edit on "Translate image in side panel" opens its options; "Opens in" is a radio group with "On the page" and "Side panel".
- Step 3 (pick On the page): the row's stored `surface` is `tooltip`; its id stays `ega-translate-image`, and its name becomes "Translate image".

## Visible affordances

- The hint under "Opens in" reads "On the page shows a tooltip on the image".
- The row stays mounted, so the radio keeps keyboard focus.

## Failure-mode expectations

- A storage write failure shows a "Change not saved" warning.

## Cautions

- Each image row decides where it opens. A tooltip Retry reruns on the tooltip, whatever any older stored global says.
