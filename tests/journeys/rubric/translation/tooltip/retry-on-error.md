# Tooltip retry-on-error rubric

## Latency budgets

- Error state visible: <= 5s after request start (don't leave the user staring at a spinner forever).
- Retry click -> new request fired: <= 100ms.

## State expectations

- Step 1: tooltip body shows the error in danger tone as "<error label>: <message>"; a Retry button shows for retryable codes.
- Step 2 (click Retry): the tooltip reopens at the same anchor with the loading shimmer; the source text is unchanged.
- Step 3: on success, the translation replaces the error in place (no second tooltip).

## Visible affordances

- Retry is an icon button (aria-label "Retry"); during a Retry-After window it is disabled and shows "Retry in Ns".
- A "Continue in side panel" text button hands the source text to the side panel.

## Failure-mode expectations

- Each failed retry shows the same error UI; there is no extra help after repeated failures.
- Network-offline state is detected and surfaces a specific message, not a generic "request failed".

## Cautions

- Never lose the input text on retry. Never wipe the tone or target-language selection.
