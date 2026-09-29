# Popup-sidepanel-handoff handoff-stale-payload-rejected rubric

## Latency budgets

- Sidepanel mount with stale slot -> clean mount: <= 400ms.

## State expectations

- Step 1: `pendingPopupHandoff` carries a payload with `timestamp` older than 60s.
- Step 2: sidepanel mounts; reads the payload; computes age; rejects on stale.
- Step 3: the slot is cleared; the sidepanel mounts in its default empty state.

## Visible affordances

- N/A — the affordance is the absence of a seeded turn.

## Failure-mode expectations

- A payload with no `timestamp` (older corrupt format) is treated as stale by default.
- A payload from a future time (clock skew) is accepted — never reject because of negative age.

## Cautions

- The 60s TTL is wall-clock; do not use a monotonic clock that gets reset on Chrome restart.
- Stale rejection MUST clear the slot — leaving a stale payload to bother later mounts is a bug.
