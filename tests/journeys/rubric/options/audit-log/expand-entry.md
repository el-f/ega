# Options-audit-log expand-entry rubric

## Latency budgets

- Row click -> collapsible body visible: <= 150ms.

## State expectations

- Step 1: audit-log panel has at least one entry row.
- Step 2 (click row): the row expands; a collapsible body renders containing the prompt sent, the response received, and the round-trip latency.
- Step 3 (click row again): the body collapses.

## Visible affordances

- Collapsed row shows a chevron pointing right; expanded shows chevron pointing down (or equivalent).
- Expanded body uses a monospace or pre-wrap style for prompt/response text.
- Latency shows in milliseconds; prompt and response text are truncated at a reasonable length with a "Show more" toggle if needed.

## Failure-mode expectations

- An entry with a missing or empty prompt/response field shows a muted placeholder ("(empty)") rather than a blank section.

## Cautions

- Expanded body must NOT leak sensitive API keys even if they were accidentally included in a prompt; display is raw stored content.
- Only one row should be expanded at a time (accordion behavior) OR multiple can be open — match the project's established pattern.
- Prompt text must NOT be editable in the expanded view.
