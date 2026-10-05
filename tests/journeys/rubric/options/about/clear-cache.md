# Options-about clear-cache rubric

## Latency budgets

- Clear cache click -> confirm dialog: <= 100ms.
- Confirm -> dialog closes + cache:clear sent: <= 300ms.

## State expectations

- Step 1: About tab is visible; "Clear cache" button is present.
- Step 2 (click Clear cache): a confirm dialog appears.
- Step 3 (confirm): the dialog closes and the page sends cache:clear to the service worker, which empties its in-memory cache; a success toast says "Translation cache cleared."

## Visible affordances

- The dialog's Clear cache confirm button uses the danger tone; the About-tab trigger button is secondary.
- The Clear cache button shows a loading state while the message is sent, then a success toast confirms.

## Failure-mode expectations

- Cancel sends no cache:clear message; the cache stays intact.
- A failed cache:clear message shows a danger toast with the error and a "Try again" action that asks again.

## Cautions

- Clear cache removes the translation result cache only; it does NOT clear settings, glossary, rules, or audit log.
- Cache clears immediately on confirm; the next translate will incur a fresh network request.
