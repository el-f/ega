# Settings-runtime-propagation task-override-used-by-request rubric

## Latency budgets

- Summarize send -> the request leaves for the backend: <= 300ms.

## State expectations

- Step 1: settings hold an edit to Summarize's system prompt (`taskOverrides.summarize.system`) and no edit to its user prompt.
- Step 2 (Summarize chip, then Send): the side panel sends the text as a Summarize request.
- Step 3: the backend receives the edited system text in place of the shipped one, and the shipped user prompt (`TEXT:` fence) still wraps the text.

## Visible affordances

- N/A — this is a request-shape contract.

## Failure-mode expectations

- An edited prompt half never sits next to the shipped half it replaced; each half is either the user's or the shipped one.

## Cautions

- Edits to built-in tasks store only the halves and switches that differ from the shipped task, so a later fix to an untouched half still reaches the user.
