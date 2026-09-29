# Describe-change llm-success-adds-rule rubric

## Latency budgets

- Submit click -> LLM JSON returned: <= 4s (warm chain).
- JSON parse + rule append: <= 200ms.

## State expectations

- Step 1: user types a freeform description ("Don't translate brand names").
- Step 2 (submit): backend returns a JSON-shaped rule envelope; parse succeeds.
- Step 3: a structured rule appears in `rules` with the parsed category + body; success toast confirms.

## Visible affordances

- Submit button shows a streaming indicator while in flight.
- Success toast names the rule body or category.

## Failure-mode expectations

- Malformed JSON triggers the fallback path (separate rubric).
- Backend failure triggers the fallback path.

## Cautions

- The parsed rule must carry the SAME shape as a manually-added rule — same fields, same defaults.
- The LLM-generated rule defaults to `enabled === true`.
