# Rules-editor toggle-enabled rubric

## Latency budgets

- Checkbox click -> storage write: <= 100ms.

## State expectations

- Step 1: the rule's checkbox is checked; its name is "Use rule: <rule text>".
- Step 2 (click the checkbox): `enabled` flips and storage writes at once.
- Step 3: the box is unchecked; nothing else on the row changes.

## Visible affordances

- The checkbox state is the only on/off signal: no "On" label, no "Off" badge, no dashed border, no faded text.

## Failure-mode expectations

- A failed write keeps the prior state and shows a "Not saved" toast.

## Cautions

- Turning a rule off removes it from the next request's prompt; the order stays.
- There is no separate save step.
