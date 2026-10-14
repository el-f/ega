# Options-tasks version-banner-overwrite rubric

## Latency budgets

- "Use the new prompt" click -> prompt written and notice gone: <= 300ms.

## State expectations

- Step 1: the user's Translate prompt is edited and from an older version; the notice "A newer built-in Translate prompt is available" sits inside the Prompt section.
- Step 2 (click "Use the new prompt"): the prompt is replaced at once and `templateVersionAcknowledged` is the current version; the footer reads "Updated to the new prompt" with Undo.
- Step 3 (Undo): the user's old prompt is back.

## Visible affordances

- No confirm: Undo is the safety net. The notice has "Show changes", "Use the new prompt" and "Keep mine".

## Failure-mode expectations

- A failed write says so in the footer; the old prompt stays.

## Cautions

- Only `promptTemplate` changes; task and language prompts are not touched.
