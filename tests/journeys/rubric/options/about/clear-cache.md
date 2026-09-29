# Options-about clear-cache rubric

## Latency budgets

- Clear cache click -> confirm dialog: <= 100ms.
- Confirm -> session cache key removed + toast: <= 300ms.

## State expectations

- Step 1: About tab is visible; "Clear cache" button is present.
- Step 2 (click Clear cache): a confirm dialog appears.
- Step 3 (confirm): the session cache storage key is removed; a success toast appears.

## Visible affordances

- Confirm dialog uses a warning tone (destructive action, though low impact).
- Toast confirms "Cache cleared" and is brief (~2s).

## Failure-mode expectations

- Cancel leaves the cache key untouched.
- Storage remove failure surfaces an inline error inside the About panel.

## Cautions

- Clear cache removes the translation result cache only; it does NOT clear settings, glossary, rules, or audit log.
- Cache clears immediately on confirm; the next translate will incur a fresh network request.
