# Popup-sidepanel-handoff handoff-stale-payload-rejected rubric

## Latency budgets

- Sidepanel mount with stale slot -> clean mount: <= 400ms.

## State expectations

- Step 1: `ega.pendingPopupHandoff` holds an entry whose `ts` is older than 60s.
- Step 2: sidepanel mounts; reads the payload; computes age; rejects on stale.
- Step 3: no turn is seeded; the stale entry stays in storage until the next handoff write drops it.

## Visible affordances

- N/A — the affordance is the absence of a seeded turn.

## Failure-mode expectations

- An entry with no numeric `ts` fails decode and is skipped.
- A payload from a future time (clock skew) is accepted — never reject because of negative age.

## Cautions

- The 60s TTL is wall-clock; do not use a monotonic clock that gets reset on Chrome restart.
- Stale entries are skipped on every drain and dropped on the next handoff write; they never seed a turn.
