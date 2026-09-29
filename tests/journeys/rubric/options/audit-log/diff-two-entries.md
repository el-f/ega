# Options-audit-log diff-two-entries rubric

## Latency budgets

- Select second entry -> Compare button enables: <= 1 frame.
- Compare click -> AuditDiffModal open: <= 200ms.

## State expectations

- Step 1: user opens the audit-log panel with at least two entries; selects/marks two entries for comparison.
- Step 2 (click Compare): the AuditDiffModal opens with a side-by-side diff of the two entries (prompt and response).
- Step 3: user reviews the diff; closes the modal with Esc or the close button.

## Visible affordances

- Each row carries a compare-selection affordance (checkbox or mark button); activates when a second row is also marked.
- AuditDiffModal uses the project's modal chrome with side-by-side columns labeled with their timestamps.
- Diff highlights added text (green), removed text (red), and unchanged text (neutral) at the word level.

## Failure-mode expectations

- Selecting only one entry keeps the Compare button disabled.
- Selecting the same entry twice: Compare is blocked with an inline hint ("Select two different entries to compare").
- Modal fails to open (e.g. component error): inline error in the log panel; entries stay selected.

## Cautions

- Diff is for the RESPONSE text only, not for system metadata like backend id or latency.
- AuditDiffModal must trap focus while open; Esc returns focus to the log row.
