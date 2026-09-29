# Page-translate english-paragraph-skipped rubric

## Latency budgets

- N/A — this is a non-render contract (no backend request fires for the paragraph).

## State expectations

- Step 1: a paragraph is identified as English by the heuristic gate.
- Step 2: the paragraph is excluded from the batch payload — no request body, no token spend.
- Step 3: the paragraph remains untouched on the page; no wrapper, no marker.

## Visible affordances

- N/A — the affordance is the absence.

## Failure-mode expectations

- Mixed-language paragraphs (English with embedded non-English phrase) -> heuristic classifies based on dominant language; borderline cases skip translation rather than risk a confusing partial result.

## Cautions

- The heuristic must run client-side only — no per-paragraph language-detect API call.
- A paragraph below the minimum length threshold is also skipped (whitespace-only, single character).
