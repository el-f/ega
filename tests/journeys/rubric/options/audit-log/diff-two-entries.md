# Options-audit-log diff-two-entries rubric

## Latency budgets

- Compare click -> comparison dialog open: <= 200ms.

## State expectations

- Step 1: user opens the Recent requests card with at least two entries and opens Details on one; presses "Compare" there.
- Step 2: the line above the list reads "Pick a second request to compare" with "Show the first" and "Cancel"; the user opens Details on a second request and presses its "Compare".
- Step 3: the dialog "Compare two requests" opens with both requests side by side, older on the left: Meta, System, User, Response. The user closes it with Esc or the close button.

## Visible affordances

- Compare is a labelled text button inside Details, pressed (aria-pressed) while it is the first pick; there is no unlabeled icon on the row.
- The dialog uses the Dialog chrome; each column starts with a Meta block (time, task, backend, model, languages, latency). Column headings are sentence case.
- No diff highlighting: both entries render as plain text side by side.

## Failure-mode expectations

- Picking only one request keeps the "Pick a second request to compare" line with Cancel; no dialog opens.
- Pressing Compare on the picked request again cancels the pick; the line goes away.
- A compared request trimmed from the log while the dialog is open closes it and shows "A compared request left the list, so the comparison closed."

## Cautions

- Both columns show meta (task, backend, model, latency), system prompt, user prompt and response.
- The dialog must trap focus while open; Esc returns focus to the list.
