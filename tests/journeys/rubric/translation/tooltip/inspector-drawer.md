# Tooltip inspector-drawer rubric

## Latency budgets

- Details trigger -> panel open: <= 200ms.
- Panel close: <= 150ms.

## State expectations

- Step 1: tooltip is finalized; a Details (i) button (`aria-label="Show details about this reply"`) shows in the action row when the reply carries result data or page info.
- Step 2 (click): an "About this reply" panel expands below the action row with Answered by (backend and a readable model name), Languages, Time (with first words), Confidence when the reply has one, Usage ("N tokens read · M written") when reported, a folded "Backends tried (N)" when it fell back, then "What was sent".
- Step 3 (close via the Details toggle or the panel's X "Close"): the panel collapses; the body is unchanged.

## Visible affordances

- Esc closes the whole tooltip; the panel itself closes via its X button or the Details toggle.
- Each row carries a plain-language label and value; backend names, never raw ids.

## Failure-mode expectations

- An error result has no Details button: the error row offers only Copy (for partial text), "Try again" and "Continue in side panel".

## Cautions

- The panel must NOT cover the close-X — both must remain reachable.
