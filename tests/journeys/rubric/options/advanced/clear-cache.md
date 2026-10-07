# Options-advanced clear-cache rubric

## Latency budgets

- Clear cache click -> cache:clear sent: <= 300ms.
- Click -> success toast: <= 500ms.

## State expectations

- Step 1: Advanced > Data is visible; the Reset and delete card has the row "Clear saved answers" with the line "Translations run again next time" and a "Clear cache" button.
- Step 2 (click Clear cache): no dialog opens; the page sends cache:clear to the service worker, which empties its in-memory cache.
- Step 3: a success toast says "Saved answers cleared". There is no Undo: nothing a user loses.

## Visible affordances

- Clear cache is a secondary button whose accessible description is its row line.

## Failure-mode expectations

- A failed cache:clear message shows a danger toast "Saved answers were not cleared. Chrome did not take the change." with Try again.

## Cautions

- Clear cache removes the translation result cache only; it does NOT clear settings, glossary, rules, or the request list.
- The next translate makes a fresh network request.
