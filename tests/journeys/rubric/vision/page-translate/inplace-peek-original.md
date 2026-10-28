# Page-translate inplace-peek-original rubric

## Latency budgets

- Mouse down on a settled block -> the page words show: one frame, no request.

## State expectations

- Step 1: in Replace text mode a settled block's wrapper (`data-ega-replaced`, `data-ega-tx-state="ok"`) shows the translation.
- Step 2: the page's own elements in the block stay in the DOM with `data-ega-hidden`, and the page sheet sets `display: none` on them.
- Step 3: while the mouse is held on the wrapper, it shows a copy of the page words and carries `data-ega-peek`; the copy keeps its own spacing (`white-space: normal`).
- Step 4: on release the translation comes back, `data-ega-peek` is gone and the translation keeps its line breaks (`white-space: pre-line`).

## Visible affordances

- Press and hold on a replaced block is the way to read the original without reverting the page.

## Failure-mode expectations

- A block still streaming or in an error state does not swap on press.

## Cautions

- The page's own nodes never leave the page: a framework that holds them can still move or remove them.
- Releasing the mouse outside the block must still bring the translation back (`mouseleave`).
