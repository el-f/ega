# Tooltip-sidepanel-escalation retry-escalates-to-sidepanel rubric

## Latency budgets

- Continue-in-sidepanel click -> sidepanel open + first turn: <= 800ms.

## State expectations

- Step 1: tooltip has exhausted retries (typically 2 consecutive failures).
- Step 2: a "Continue in side panel" secondary affordance surfaces in the tooltip error state.
- Step 3 (click): tooltip dismisses; sidepanel opens with the source text + last error context as the seed UserTurn.

## Visible affordances

- The CTA uses a secondary action token (not primary — primary is still Retry).
- The seeded sidepanel turn carries an inline marker explaining the escalation.

## Failure-mode expectations

- Sidepanel API failure -> the tooltip stays mounted; an inline notice surfaces; tooltip retries remain available.

## Cautions

- The escalation must preserve the user's source text, tone, target language verbatim — no loss across surfaces.
- Cancellation: aborting the tooltip's in-flight request via this path uses the shared CancelReason bus.
