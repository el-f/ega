# Rules-editor toggle-enabled rubric

## Latency budgets

- Toggle click -> storage write: <= 100ms.

## State expectations

- Step 1: rule row shows a power toggle with the rule's current `enabled` state.
- Step 2 (click toggle): the `enabled` field flips; storage writes immediately.
- Step 3: the rule's visual state (saturation / opacity) reflects the new state.

## Visible affordances

- Toggle uses the project's switch primitive; tone tokens match enabled / disabled state.
- Disabled rules carry reduced opacity but remain legible — never struck-through.

## Failure-mode expectations

- Storage write failure surfaces an inline error icon on the row; the toggle reverts to the prior state.

## Cautions

- Disabling a rule removes it from the next request's system prompt; rule order is preserved (no renumbering).
- Toggle commits on click — no explicit save step.
