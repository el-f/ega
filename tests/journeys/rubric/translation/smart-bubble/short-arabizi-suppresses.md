# Smart-bubble short-arabizi-suppresses rubric

## Latency budgets

- N/A — this is a non-render contract.

## State expectations

- Step 1: user selects a short Latin-script string (below the heuristic length threshold) that could be mis-classified as arabizi.
- Step 2: the heuristic gate evaluates false; bubble does NOT mount.
- Step 3: the user can still trigger via right-click context menu / keyboard shortcut — the smart-bubble suppression is not a full block, just a noise-reduction filter.

## Visible affordances

- N/A — the affordance is the absence of the bubble.

## Failure-mode expectations

- A length boundary case (one character above the threshold) MUST mount the bubble; one below MUST suppress it. The boundary is deterministic.

## Cautions

- This rubric guards the "false-positive bubble on every short English word" regression.
- The threshold lives in `src/content/should-show-bubble.ts` constants — do not duplicate it across surfaces.
