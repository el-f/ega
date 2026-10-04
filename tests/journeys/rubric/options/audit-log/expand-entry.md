# Options-audit-log expand-entry rubric

## Latency budgets

- Row click -> collapsible body visible: <= 150ms.

## State expectations

- Step 1: audit-log panel has at least one entry row.
- Step 2 (click the timestamp or latency area): the row expands; the body shows Model, Languages (plus request id, first token, confidence, error when set) and System / User / Response panels.
- Step 3 (click row again): the body collapses.

## Visible affordances

- Collapsed row shows a chevron pointing right; expanded shows chevron pointing down (or equivalent).
- Expanded body uses a monospace or pre-wrap style for prompt/response text.
- Latency shows as ms under 1s, else seconds; long text scrolls inside its panel and clipped text ends with "...[truncated N chars]"; no Show more toggle.

## Failure-mode expectations

- An empty prompt/response field renders an empty panel; there is no placeholder.

## Cautions

- Expanded body must NOT leak sensitive API keys even if they were accidentally included in a prompt; display is raw stored content.
- Only one row should be expanded at a time (accordion behavior) OR multiple can be open — match the project's established pattern.
- Prompt text must NOT be editable in the expanded view.
