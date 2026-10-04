# Page-translate reload-toast-after-chunk-loss rubric

## Latency budgets

- Failed lazy import -> toast with "Reload page": <= 500ms.

## State expectations

- Step 1: the extension was updated while the page stayed open; the running content script's next lazy chunk 404s.
- Step 2: `page:translateAll` fails on the import; a toast says Ega was updated and offers "Reload page".
- Step 3 (click): the page reloads; a fresh content script runs and the toast is gone.

## Visible affordances

- Toast carries one action button labeled "Reload page"; it outlives a plain notice (12s).
- Toast uses the shadow host, so page styles cannot break it.

## Failure-mode expectations

- A CSS preload 404 (Vite resolves preload hrefs against the page origin) must not trigger the toast — only a lost JS chunk does.
- A dead extension context shows the same toast with the same action.

## Cautions

- No silent failure: a translate that cannot load its code must say so, not look like a dead button.
