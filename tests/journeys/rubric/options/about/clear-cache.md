# Options-about clear-cache rubric

## Latency budgets

- Clear cache click -> confirm dialog: <= 100ms.
- Confirm -> dialog closes + cache:clear sent: <= 300ms.

## State expectations

- Step 1: About tab is visible; "Clear cache" button is present.
- Step 2 (click Clear cache): a confirm dialog appears.
- Step 3 (confirm): the dialog closes and the page sends cache:clear to the service worker, which empties its in-memory cache; no toast appears.

## Visible affordances

- The dialog's Clear cache confirm button uses the danger tone; the About-tab trigger button is secondary.
- No toast; the Clear cache button shows a loading state while the message is sent.

## Failure-mode expectations

- Cancel sends no cache:clear message; the cache stays intact.
- A failed cache:clear message is only logged (debugCatch); no error shows in the About panel.

## Cautions

- Clear cache removes the translation result cache only; it does NOT clear settings, glossary, rules, or audit log.
- Cache clears immediately on confirm; the next translate will incur a fresh network request.
