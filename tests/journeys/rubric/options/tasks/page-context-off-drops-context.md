# Options-tasks page-context-off-drops-context rubric

## Latency budgets

- Shortcut -> backend request: <= 2s with the mock backend.

## State expectations

- Step 1: with the shipped settings, a Translate request carries the page title in its prompt.
- Step 2: with `taskOverrides.translate.pageContext` false, the next Translate request carries no page title or other page text.

## Visible affordances

- The tooltip still shows the translation; only the request changes.

## Failure-mode expectations

- None beyond the normal translate errors.

## Cautions

- The cache is off in this flow, so the second request reaches the backend.
