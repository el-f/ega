# Picker sensitive-target-rejected rubric

## Latency budgets

- Click on sensitive target -> rejection feedback: <= 200ms.

## State expectations

- Step 1: picker overlay is mounted; user clicks a password / card / one-time-code field, editable text (contenteditable, role=textbox), or a data-ega-skip region.
- Step 2: the click is discarded; the picker stays mounted; the user can pick again.
- Step 3: a toast surfaces ("Ega does not read password, card or other private fields, or text you can edit."); no overlay re-mount.

## Visible affordances

- Hovering a sensitive target hides the outline (no distinct tone).

## Failure-mode expectations

- Eligibility is checked on the clicked element and its ancestors at click time; what the element does on click is not considered.

## Cautions

- Password inputs are NEVER captured. Even if the user "wants" to translate the field label, the value side is off-limits.
- The rejection toast has fixed copy and names no element data (no `<input type=password id=mySecret>` leak).
