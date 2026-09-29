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

- The heuristic favors conservatism — a borderline case must default to NOT showing the bubble. False positives are worse than false negatives.

## Cautions

- The heuristic must run client-side only; no backend round-trip to decide bubble visibility.
- The digitless arabizi heuristic is documented in `src/content/should-show-bubble.ts` — changes to that threshold require updating this rubric's state expectations.
