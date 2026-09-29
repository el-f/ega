# Templates-editor version-banner-show-diff rubric

## Latency budgets

- "Show diff" click -> TemplateDiffModal mount: <= 200ms.

## State expectations

- Step 1: version banner is visible on the templates editor.
- Step 2 (click "Show diff"): `TemplateDiffModal` mounts displaying the user's current body alongside the new default body.
- Step 3: the diff highlights additions and removals at the word or line level; the user can then choose "Keep mine" or "Overwrite" from within the modal.

## Visible affordances

- Diff uses color tokens: additions in green, removals in red.
- Modal carries a heading naming the scope (e.g., "Global template changes in v2.3").
- Close / dismiss button is visible; Esc dismisses.

## Failure-mode expectations

- If the diff is empty (bodies are identical, which should not happen when the banner is shown), the modal renders a "No differences" notice rather than a blank diff panel.

## Cautions

- The modal must trap focus while open; Esc dismisses without taking any action.
- "Show diff" does NOT acknowledge the version — the banner stays after the modal is closed.
