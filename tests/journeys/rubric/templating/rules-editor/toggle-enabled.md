# Rules-editor toggle-enabled rubric

## Latency budgets

- Toggle click -> storage write: <= 100ms.

## State expectations

- Step 1: rule row shows an "On" checkbox with the rule's current `enabled` state.
- Step 2 (click the checkbox): the `enabled` field flips; storage writes immediately.
- Step 3: an "Off" badge appears on the row and its border turns dashed.

## Visible affordances

- The toggle is a checkbox whose label stays "On"; only its checked state changes.
- Disabled rules keep full text contrast — no opacity, never struck-through.

## Failure-mode expectations

- Storage write failure keeps the prior state; a "Change not saved: …" warning toast appears (no inline error).

## Cautions

- Disabling a rule removes it from the next request's system prompt; rule order is preserved (no renumbering).
- Toggle commits on click — no explicit save step.
