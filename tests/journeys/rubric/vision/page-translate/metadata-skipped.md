# Page-translate metadata-skipped rubric

## Latency budgets

- N/A — this is a non-render contract.

## State expectations

- Step 1: page contains metadata chrome (Reddit-style timestamps, vote counts, breadcrumbs).
- Step 2: the candidate enumerator excludes these via DOM selectors / structural heuristics.
- Step 3: only meaningful body paragraphs enter the batch payload.

## Visible affordances

- N/A — the affordance is the absence.

## Failure-mode expectations

- A site that uses non-standard markup (custom elements / shadow DOM chrome) may slip past the heuristic — surfacing as cost waste, not user-visible damage. Acceptable.
- An empty page (only chrome, no body) hits the `empty-page-toast` rubric.

## Cautions

- The skip list is curated per-site for common patterns (Reddit, Twitter/X, news article chrome); the gate must not be a hard-coded URL match — it's a structural heuristic.
- Skipping must NEVER drop translatable user content. Bias toward sending too much over too little.
