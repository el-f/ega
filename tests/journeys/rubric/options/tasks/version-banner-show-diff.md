# Options-tasks version-banner-show-diff rubric

## Latency budgets

- "Show diff" click -> TemplateDiffModal mount: <= 200ms.

## State expectations

- Step 1: version banner is visible on the templates editor.
- Step 2 (click "Show diff"): `TemplateDiffModal` mounts displaying the user's current body alongside the new default body.
- Step 3: the diff marks each line: − for the user's line, + for the current default; the only action is Close (Keep mine / Overwrite stay on the banner).

## Visible affordances

- Diff uses color tokens: additions in green, removals in red.
- Modal title reads "Template version diff", with System and User sections.
- Close / dismiss button is visible; Esc dismisses.

## Failure-mode expectations

- Identical bodies render as unmarked lines; a body too long to diff shows "Too long to diff line by line." instead of a blank panel.

## Cautions

- The modal must trap focus while open; Esc dismisses without taking any action.
- "Show diff" does NOT acknowledge the version — the banner stays after the modal is closed.
