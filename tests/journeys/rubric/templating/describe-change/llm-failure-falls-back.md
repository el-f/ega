# Describe-change llm-failure-falls-back rubric

## Latency budgets

- Failure detection -> fallback rule created: <= 5s (includes backend retry budget).

## State expectations

- Step 1: user submits a description; the backend errors OR returns malformed JSON.
- Step 2: the fallback path runs — a heuristic rule is constructed from the trimmed user description, category defaults to a sensible bucket.
- Step 3: the fallback rule appears in `rules`; a notice surfaces ("Used local fallback") so the user knows the LLM didn't succeed.

## Visible affordances

- The fallback notice uses the warning tone tokens; carries a "Retry with LLM" affordance.
- The rule body is the user's input trimmed; category is a default like "custom".

## Failure-mode expectations

- Repeated LLM failures still create fallback rules; the user is never blocked from rule creation.

## Cautions

- The fallback rule must be visually indistinguishable from a manually-added rule in the rules list — same shape, same controls.
- The notice must NOT auto-dismiss too quickly; the user needs to understand the LLM didn't run.
