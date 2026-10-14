# Options-settings-search close-esc rubric

## Latency budgets

- Esc keypress -> modal dismiss: <= 100ms.

## State expectations

- Step 1: settings-search modal is mounted (with or without a query).
- Step 2 (press Esc): the modal unmounts.
- Step 3: focus returns to the element that held it before the modal opened.

## Visible affordances

- The empty-query hint lists example queries (temperature, cache, backend, shortcut); Esc is not named in the modal.
- No close icon; mouse users dismiss by clicking the backdrop.

## Failure-mode expectations

- Esc while the result list has focus must still dismiss the modal (not just deselect the result).
- Esc while a query is half-typed must still dismiss (no confirm to save the query).

## Cautions

- Esc must NOT bubble to the page (Options is a top-level shell; no page-level Esc handler downstream).
- Click-outside also dismisses; both paths return focus correctly.
