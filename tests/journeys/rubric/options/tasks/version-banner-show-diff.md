# Options-tasks version-banner-show-diff rubric

## Latency budgets

- "Show changes" click -> diff dialog: <= 200ms.

## State expectations

- Step 1: the version notice is visible inside the Translate prompt section.
- Step 2 (click "Show changes"): the diff dialog opens on top of the task dialog with the user's prompt and the new built-in.
- Step 3: each line is marked: − for the user's line, + for the new built-in; the only action is Close.

## Visible affordances

- Additions and removals use the success and danger tokens; System and User sections.
- Esc closes only the diff dialog; the task dialog stays open under it.

## Failure-mode expectations

- Identical prompts render as unmarked lines; a prompt too long to diff says so instead of a blank panel.

## Cautions

- "Show changes" does NOT acknowledge the version — the notice stays after the diff closes.
