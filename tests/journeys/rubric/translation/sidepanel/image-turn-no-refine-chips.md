# Sidepanel image-turn-no-refine-chips rubric

## Latency budgets

- Image-translate turn completes -> absence of chips must be verifiable within 200ms of stream end.

## State expectations

- Step 1: an external image-translate turn is handed to the sidepanel (via `sidepanel-seed-then-stream` or direct image OCR dispatch); the AssistantTurn completes with `imageUrl` set.
- Step 2: the turn footer is inspected immediately after completion.
- Step 3: NO quick-refine chips are present, and NO error-path Retry button (`.ega-retry-btn`) is present. The done-footer Regenerate IS present: the seed records a dispatch on the user turn, so the vision pass can re-run.

## Visible affordances

- The source image thumbnail renders (`.ega-imgprev img`), not just the OCR text.
- The footer carries Copy, Regenerate, Bookmark and Delete. Copy is present only when the turn holds text of its own — the `[image]` marker alone is not text.
- The swap control is disabled: an image has no source language to swap from.

## Failure-mode expectations

- Quick-refine chips on an image turn are a regression — the test must fail explicitly.
- A missing Regenerate on a seeded image turn is also a regression: an image turn is not a Task, but it does re-run.

## Cautions

- The suppression flag is the image on the user turn (`imageDataUrl`), never the turn kind: an Explain-with-image send carries an image under kind `explain`.
- What image turns lack is a Task mapping, which is why the chips and the task-switch list are narrowed — not the ability to re-run.
- This rubric covers external image turns only; a sidepanel-originated explain on image-attached text may still allow some affordances.
