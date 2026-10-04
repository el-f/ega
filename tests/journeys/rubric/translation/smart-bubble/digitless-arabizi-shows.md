# Smart-bubble digitless-arabizi-shows rubric

## Latency budgets

- Selection-change -> bubble first paint: <= 200ms.

## State expectations

- Step 1: user selects pure-Latin text matching the digitless arabizi heuristic (length >= threshold, no digits, ambiguous script markers).
- Step 2: the heuristic gate evaluates true; bubble mounts.
- Step 3: clicking the bubble opens the tooltip seeded with the selection.

## Visible affordances

- Standard bubble affordances apply — no special variant for arabizi.

## Failure-mode expectations

- When no language matches, the bubble shows unless the text reads as confidently English.

## Cautions

- The heuristic must run client-side only; no backend round-trip to decide bubble visibility.
- Digit-less Arabizi passes because the English check in `src/content/looks-like-english.ts` does not read it as English; changes there require updating this rubric.
