# Recipes-gallery paste-shared-invalid-payload rubric

## Latency budgets

- Preview click with invalid input -> error shown: <= 200ms.

## State expectations

- Step 1: user opens "Paste shared" dialog and pastes garbage or malformed text.
- Step 2 (click Preview): the decode attempt fails.
- Step 3: an inline error renders inside the dialog — "This does not look like a recipe code. Ask your teammate to copy it again with Export." — and the Import action does NOT appear.

## Visible affordances

- Error uses danger tone tokens; the textarea retains the invalid input so the user can inspect it.
- The "Preview" button returns to its default state after the failure.

## Failure-mode expectations

- The dialog must stay open after a failed preview.
- `userRecipes` is not written at any point in this failure flow.

## Cautions

- "Invalid" covers: empty string, non-base64 characters, valid base64 but non-JSON content, valid JSON but missing required recipe fields.
- The error message must be user-friendly, not a raw JSON parse exception stack trace.
