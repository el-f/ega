# Templates-editor version-banner-overwrite rubric

## Latency budgets

- Confirm click -> template write + banner dismiss: <= 200ms.

## State expectations

- Step 1: a version upgrade makes the built-in default diverge; the version banner mounts.
- Step 2 (click "Overwrite"): a confirm dialog surfaces warning that the user's saved template will be replaced.
- Step 3 (confirm): `promptTemplate` is overwritten with the new default body; `templateVersionAcknowledged` is updated; banner dismisses.

## Visible affordances

- Confirm dialog uses danger tone tokens — this is destructive (replaces user-authored content).
- The dialog body quotes a brief excerpt of what will be replaced.

## Failure-mode expectations

- Cancel on the confirm dialog leaves `promptTemplate` untouched and keeps the banner visible.
- Storage write failure surfaces an inline error; the old template body is preserved.

## Cautions

- Overwrite is irreversible once confirmed — there is no Undo for template overwrites.
- The user's per-task and per-language overrides are NOT affected by this action; only `promptTemplate` (Global).
