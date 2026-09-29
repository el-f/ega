# Tooltip retry-on-error rubric

## Latency budgets

- Error state visible: <= 5s after request start (don't leave the user staring at a spinner forever).
- Retry click -> new request fired: <= 100ms.

## State expectations

- Step 1: tooltip shows an error chip with the failure reason in plain language (no raw HTTP code).
- Step 2 (click retry): the error chip is replaced by the streaming/loading affordance; the user's original input is unchanged.
- Step 3: on success, the translation replaces the error in place (no second tooltip).

## Visible affordances

- Retry control is a primary action button (not a tiny text link).
- Optional: "Open in side panel" secondary action for users who want to escape the tooltip entirely.

## Failure-mode expectations

- Two retries in a row that both fail surface a help affordance ("try a different backend" link or chain chip), not just an identical "Try again" button.
- Network-offline state is detected and surfaces a specific message, not a generic "request failed".

## Cautions

- Never lose the input text on retry. Never wipe the tone or target-language selection.
