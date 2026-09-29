# Describe-change empty-input-blocked rubric

## Latency budgets

- N/A — this is a disabled-state contract.

## State expectations

- Step 1: Apply button is checked with an empty textarea — Apply is disabled.
- Step 2: user types whitespace-only content into the textarea — Apply remains disabled.
- Step 3: user types at least one non-whitespace character — Apply becomes enabled.

## Visible affordances

- Apply button uses the disabled visual state (reduced opacity / no pointer) for both empty and whitespace-only inputs.
- No error message is needed for empty input — the disabled state communicates the constraint.

## Failure-mode expectations

- Whitespace-only input must be treated as empty — `" ".trim() === ""` is the check.
- If the disabled button is clicked via automation, no LLM request is dispatched and no rule is added.

## Cautions

- The disabled check must use `.trim()` on the input value — a leading/trailing space must not enable Apply.
- Clearing the textarea after typing (back to empty) must re-disable Apply without a page reload.
