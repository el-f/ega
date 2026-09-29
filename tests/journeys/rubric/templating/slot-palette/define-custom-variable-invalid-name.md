# Slot-palette define-custom-variable-invalid-name rubric

## Latency budgets

- Invalid name input -> defineErr shown: <= 100ms.

## State expectations

- Step 1: user opens the Define dialog for a custom variable.
- Step 2: user types an invalid name (e.g., contains spaces, starts with a digit, or uses reserved slot names).
- Step 3: a `defineErr` inline error renders inside the dialog; the dialog stays open; no storage write occurs.

## Visible affordances

- `defineErr` uses the danger tone tokens and names the constraint that was violated (e.g., "Name must start with a letter and contain only letters, digits, and underscores").
- The submit button is disabled while `defineErr` is present.

## Failure-mode expectations

- The dialog must NOT close on invalid submit — the user must fix the name before proceeding.
- No storage write occurs at any point during the invalid-name flow.

## Cautions

- Valid name pattern: `[a-zA-Z][a-zA-Z0-9_]*` — verify the exact rule against the slot-registry validation function.
- The error must clear immediately when the user edits the name to a valid value.
