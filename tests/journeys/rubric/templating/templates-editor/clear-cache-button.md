# Templates-editor clear-cache-button rubric

## Latency budgets

- Button click -> cache cleared + success toast: <= 500ms.

## State expectations

- Step 1: user is in the templates workbench; a "Clear translation cache" button is visible.
- Step 2 (click): the session translation cache is cleared in storage.
- Step 3: a success toast surfaces ("Translation cache cleared"); the button returns to its default state.

## Visible affordances

- Button uses a secondary or neutral style (not danger-toned — clearing cache is recoverable).
- Success toast is dismissable and auto-expires after ~3s.

## Failure-mode expectations

- If the cache is already empty, the button still shows success — clearing an empty cache is a no-op, not an error.
- Storage failure surfaces an inline error toast.

## Cautions

- Clearing the cache does NOT remove any stored templates, rules, or settings — only translation cache entries.
- The button must NOT require a confirm dialog (low-stakes action; cache rebuilds automatically on next translate).
