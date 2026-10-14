# Sidepanel variant-nav-prev-next rubric

## Latency budgets

- Previous / Next version click -> the answer swaps: <= 50ms (local state, no network).

## State expectations

- Step 1: a refine preset added version 2; the reply shows it with the pager "2/2".
- Step 2 (Previous version): the pager reads "1/2"; the answer reverts to version 1.
- Step 3 (Next version): the pager reads "2/2" again; the answer shows the refined version.

## Visible affordances

- The pager sits at the end of the reply's action row: "‹ 2/2 ›" with 28px buttons named "Previous version" and "Next version", and a polite "Version 2 of 2" for screen readers.
- At the ends the matching button has `aria-disabled`.

## Failure-mode expectations

- Previous at version 1 -> nothing happens; no wrapping to the last version.
- Next at the last version -> nothing happens; no wrapping.

## Cautions

- Navigation is local — no backend request fires on Previous or Next.
- Every version stays in memory; going away and back must not re-fetch.
- The counter and the answer update together — no frame where the counter says 1 and the answer shows version 2.
