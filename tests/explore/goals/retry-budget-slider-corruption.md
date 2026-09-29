# Goal: retry-budget-slider-corruption

You are exploring the ega Chrome extension. Your goal is to drag the
options' retryCount slider while a translate is in flight and verify
that the next attempt observes a consistent value (no torn read, no
mid-chain change).

## Surfaces in scope

- options Tunables retryCount Slider (commit-on-release semantics)
- background router `attempt chain` reading `settings.retryCount`
- `settings:update` broadcast vs. inflight request

## Hypotheses to test

1. Slider drag emits `oninput` repeatedly; if any one of those leaks
   past the commit guard into `patchSettings`, the in-flight chain's
   next attempt reads the partial value instead of the prior committed
   one.
2. Slider commit between attempts N and N+1 of the same chain — N+1
   reads the new value, but the cancel-token for the chain was bound
   to the old budget, causing under- or over-retry.
3. Slider reset to default mid-flight (via SectionReset) wipes the
   field but the router caches the resolved budget at chain start;
   subsequent translates in the same chain still see the pre-reset
   budget for one attempt.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
