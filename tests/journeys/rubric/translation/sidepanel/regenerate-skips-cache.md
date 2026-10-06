# Sidepanel regenerate-skips-cache rubric

## Latency budgets

- Regenerate click -> new variant streams: one model call, same budget as a first answer. It is never instant, because an instant answer means the cache served the old one.

## State expectations

- Step 1: a translation finished with the cache on; its answer is now stored in the cache.
- Step 2 (click Regenerate): a second variant opens and the counter reads "2/2".
- Step 3: the second variant shows the model's new answer, not a copy of the first.

## Visible affordances

- Regenerate sits in the assistant turn's action row, revealed on hover or focus.
- The variant counter and prev/next arrows appear once the second variant exists.

## Failure-mode expectations

- Regenerate must reach the model even when the same request has a cached answer.
- The new answer replaces the cached one, so a later identical request reads the regenerated text.

## Cautions

- Swap, task switch and refine ask a different question and may still read the cache.
- Regenerate keeps the prompt and the cache key unchanged; only the cache read is skipped.
