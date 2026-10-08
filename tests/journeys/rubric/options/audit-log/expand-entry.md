# Options-audit-log expand-entry rubric

## Latency budgets

- Details click -> body visible: <= 150ms.

## State expectations

- Step 1: the Recent requests card has at least one entry row.
- Step 2 (click Details): the row opens in place; the body shows Model, Languages (plus request id, first token, tokens, confidence, and the raw code under "Technical" when set) and System / User / Response panels (no Response panel when the response is empty), then a Compare button.
- Step 3 (click Details again): the body closes.

## Visible affordances

- Details is a ghost text button with aria-expanded; its accessible name adds the task and the full time.
- The body uses a monospace, pre-wrap style for prompt/response text; panel headings are sentence case.
- Latency shows as ms under 1s, else seconds with one decimal; long text scrolls inside its panel and clipped text ends with "...[truncated N chars]"; no Show more toggle.

## Failure-mode expectations

- An empty response (a failed request stores none) gets no Response panel, so the body shows System and User only. An empty prompt field still renders an empty panel; there is no placeholder.

## Cautions

- The body must NOT leak sensitive API keys even if they were accidentally included in a prompt; display is raw stored content.
- More than one row can be open at once.
- Prompt text must NOT be editable in the open view.
