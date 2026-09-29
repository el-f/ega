# Describe-change apply-blocked-when-busy rubric

## Latency budgets

- Second Apply click while busy -> no-op response: <= 50ms.

## State expectations

- Step 1: user types a description and clicks Apply; the first request is in flight (backend streaming).
- Step 2 (click Apply again while busy): the second click is a no-op — no second LLM request is dispatched.
- Step 3: only one rule is added when the first request completes.

## Visible affordances

- Apply button shows a loading/spinner state while in flight; the button is visually disabled.
- No duplicate rule appears in the rules list.

## Failure-mode expectations

- The second click must not trigger a duplicate rule, a UI error, or a crash — it is silently ignored.

## Cautions

- The busy guard is enforced in the Apply handler, not only via a disabled button attribute — clicking a visually-disabled button via automation must also be blocked.
- The guard clears immediately when the first request resolves (success or failure).
