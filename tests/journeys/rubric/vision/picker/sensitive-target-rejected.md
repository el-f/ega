# Picker sensitive-target-rejected rubric

## Latency budgets

- Click on sensitive target -> rejection feedback: <= 200ms.

## State expectations

- Step 1: picker overlay is mounted; user clicks a password / card / one-time-code field, editable text (contenteditable, role=textbox), or a data-ega-skip region.
- Step 2: the click is discarded; the picker stays mounted; the user can pick again.
- Step 3: the picker bar's status reads "Ega doesn't read password, card or code fields, or text you can edit." in the danger color; no toast covers the bar, and the overlay does not re-mount.

## Visible affordances

- Hovering a sensitive target outlines it in the danger color and the bar names the reason at once.

## Failure-mode expectations

- Eligibility is checked on the clicked element and its ancestors at click time; what the element does on click is not considered.

## Cautions

- Password inputs are NEVER captured. Even if the user "wants" to translate the field label, the value side is off-limits.
- The rejection toast has fixed copy and names no element data (no `<input type=password id=mySecret>` leak).
