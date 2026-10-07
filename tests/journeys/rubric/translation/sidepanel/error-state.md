# Sidepanel error-state rubric

## Latency budgets

- Error chunk landing -> inline error rendered in the reply: <= 100ms.

## State expectations

- Step 1: a reply is running; the backend sends an error chunk or times out.
- Step 2: the reply slot shows the error from the shared catalog: a title of four words or fewer with an alert icon, then one sentence that names the cause. The title and body sit in `role="alert"`.
- Step 3: the error's next steps are buttons in one row, the first one outlined: "Try again", "Open settings" when a setting fixes it, and "Details ▸" when the backend sent a message. Text that already arrived stays above the error.

## Visible affordances

- "Try again" shows for codes a retry can fix; "Open settings" opens the tab that fixes the code. After a second failure on the same reply, "Open settings" joins "Try again".
- Rate limit: "Try again in N s" counts down with `aria-disabled` until the wait ends.

## Failure-mode expectations

- No connection -> "No connection" with "Try again".
- Rejected key -> "API key rejected" with "Open settings" first, then "Try again".
- Out of credit -> "Out of credit" with "Open settings".

## Cautions

- The error never replaces the user's message — it occupies the reply slot only.
- Partial text from a cut stream stays, with its own Copy button, so the user can keep what landed.
