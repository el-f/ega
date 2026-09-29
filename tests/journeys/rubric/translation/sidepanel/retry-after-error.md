# Sidepanel retry-after-error rubric

## Latency budgets

- Error pill visible: <= 5s after stream initiation.
- Retry click -> new request fired: <= 100ms.

## State expectations

- Step 1: assistant turn carries an error pill explaining the failure (plain language, not raw HTTP).
- Step 2 (click retry on that turn): the error pill is replaced by a streaming indicator; the assistant slot stays in place (NEW: do not append a fresh user turn).
- Step 3: on success, the assistant turn fills with the new translation. The original user turn is unchanged.

## Visible affordances

- Retry control sits on the failed assistant turn, not floating elsewhere.
- "Try different backend" secondary action appears after 2 consecutive failures.

## Failure-mode expectations

- Two consecutive retries that both fail surface a help affordance (chain chip / backends settings link), not just an identical retry button.
- The original user input must be reachable for the user to copy / edit even after multiple failures.

## Cautions

- Retry must NOT append a new user turn. That was an old bug (0.15.0 era) — guard against regression.
- Retry must NOT discard the tone / target-language selections from the original turn.
