# Smart-bubble short-arabizi-shows rubric

## Latency budgets

- Selection-change -> bubble first paint: <= 500ms on the test box (target p95: 150ms).

## State expectations

- Step 1: user selects a short Arabizi phrase ("Min hayde": two words, above the minimum selection length).
- Step 2: the English check must not read it as English; the bubble mounts.

## Visible affordances

- The bubble renders below the selection, the same as for a longer Arabizi selection.

## Failure-mode expectations

- A Latin-script selection shorter than the minimum length (Settings → Selection and picker → Smart mode) never mounts the bubble; two or more non-Latin letters show it at any length. That is a different case from this one.

## Cautions

- This rubric guards the "short Arabizi reads as English, so the bubble never shows" regression.
- The minimum length lives in `src/shared/constants.ts`; do not duplicate it across surfaces.
