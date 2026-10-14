# Goal: exhaust-retry-budget

You are exploring the ega Chrome extension. Your goal is to drive the
router's retry budget into a state where it either over-retries (cost
blowout) or under-retries (gives up before the contract allows).

## Surfaces in scope

- background router (handleTranslate, attempt chain)
- audit log retry severity tagging
- sidepanel error frame + retry CTA

## Hypotheses to test

1. A backend that returns a 5xx then succeeds in the same chain leaves the
   audit log marking the _successful_ attempt as a retry of the _prior_
   failure, but the success severity is logged as `error`.
2. Canceling mid-attempt leaves the next attempt in the chain off-by-one
   relative to backendOrder.
3. A backend chain with three disabled providers in a row skips silently
   without an audit entry for the skip.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
