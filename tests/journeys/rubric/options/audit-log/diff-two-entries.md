# Options-audit-log diff-two-entries rubric

## Latency budgets

- Compare click -> AuditDiffModal open: <= 200ms.

## State expectations

- Step 1: user opens the audit-log panel with at least two entries; selects/marks two entries for comparison.
- Step 2 (click the compare icon on a second entry): AuditDiffModal opens with both entries side by side, older on the left: Meta, System, User, Response.
- Step 3: user reviews the diff; closes the modal with Esc or the close button.

## Visible affordances

- Each row has a compare icon button; the first click pins it (pressed) and shows a "Pick a second entry to compare" pill with Cancel; a second row's click opens the diff.
- AuditDiffModal ("Compare audit entries") uses the Dialog chrome; each column starts with a Meta block (time, task, backend, model, languages, latency).
- No diff highlighting: both entries render as plain text side by side.

## Failure-mode expectations

- Picking only one entry shows the "Pick a second entry to compare" pill with Cancel; no modal opens.
- Clicking the pinned entry again cancels the pick; no hint shows.
- A pinned entry trimmed from the log while the modal is open closes it and shows "A pinned entry was trimmed from the audit log."

## Cautions

- Both columns show meta (task, backend, model, latency), system prompt, user prompt and response.
- AuditDiffModal must trap focus while open; Esc returns focus to the log row.
