# Page-translate surface rubric

## Batch behavior

- `page:translateAll` enumerates paragraph candidates and translates non-English ones only. English paragraphs are skipped at the heuristic gate, never sent to the backend.
- Reddit-style metadata chrome (timestamps, vote counts, breadcrumbs) is excluded from candidates.
- Per-paragraph failures degrade locally — the failing paragraph stays in source language, surrounding paragraphs continue.

## Mode

- Default mode wraps each translated paragraph beside the source (toggle visible).
- Inline-replace mode swaps the source text in place; Esc restores every wrapper / replacement on the page.

## Toast

- A page with zero candidates surfaces a toast ("Nothing to translate on this page") and exits.

## Latency

- First-paragraph render: <= 2s for a typical page (warm chain).
- Esc-restore-all: <= 200ms across hundreds of paragraphs.
