# Recipes-gallery apply-full-confirmed rubric

## Latency budgets

- Confirm click -> template + rules write: <= 300ms.
- Toast feedback visible: <= 400ms.

## State expectations

- Step 1: user clicks "Apply" (full) on a recipe card.
- Step 2: a confirm dialog surfaces naming what will be replaced (template body + N rules appended).
- Step 3 (confirm): `templates[scope]` overwrites with the recipe's template; rules append to `rules`. Toast confirms.

## Visible affordances

- Confirm dialog uses the warning tone tokens (this is destructive).
- The dialog body names the destination scope explicitly.

## Failure-mode expectations

- Canceling the confirm leaves storage untouched.
- A storage write failure rolls back the template overwrite — partial apply is forbidden.

## Cautions

- The destination scope must be the user's active scope OR Global if no per-task scope is current — confirm dialog must surface this.
- Full apply is intentionally friction-heavy because it overwrites user-authored template bodies.
