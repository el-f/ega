# Rules-editor edit-rule-body rubric

## Latency budgets

- Edit -> rule text field focused: <= 100ms.
- Leaving the field -> storage write: <= 200ms.

## State expectations

- Step 1: the row shows the full rule text next to its checkbox.
- Step 2 (Edit): the fields open under the row and focus moves into "Rule text".
- Step 3 (leave the field): the trimmed text is stored, "Saved" shows, and the row text updates.

## Visible affordances

- "Rule text" is a labelled textarea; Edit reads "Close" while the row is open.

## Failure-mode expectations

- An empty text is not saved: the field is marked invalid and says "Write the rule text".
- Esc writes a changed field, closes the row and returns focus to Edit.

## Cautions

- Trim only leading/trailing whitespace — internal whitespace is significant for rule semantics.
- Editing the text does NOT turn the rule on or off; the checkbox is separate.
