# Page-translate empty-page-toast rubric

## Latency budgets

- `page:translateAll` dispatch -> toast on no-candidate page: <= 500ms.

## State expectations

- Step 1: `page:translateAll` runs on a page where the heuristic enumerates zero candidates.
- Step 2: no backend request fires; a toast surfaces on the page ("Nothing to translate on this page").
- Step 3: the page is untouched; no wrappers, no markers.

## Visible affordances

- Toast uses the warning tone tokens; auto-dismiss within 5s.
- Toast carries a "Try picker" CTA for the user to translate a specific element.

## Failure-mode expectations

- A page where the heuristic IS finding candidates but they all fail individually -> different rubric (per-paragraph error UX). This rubric is only the zero-candidate case.

## Cautions

- The toast must NOT cover existing page modals — z-index needs careful budgeting.
- The toast must be dismissable on click.
