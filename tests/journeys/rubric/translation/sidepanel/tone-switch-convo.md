# Sidepanel tone-switch-convo rubric

## Latency budgets

- Tone picker open: <= 100ms.
- New-tone first token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: sidepanel has an ongoing Reword conversation with tone X (default Neutral); the Tone select shows only under Reword.
- Step 2 (open tone picker + choose tone Y): the NEXT user message routes under tone Y; prior turns retain their original tone labels.
- Step 3: the next assistant turn applies the new tone; conversation history still feeds in as context.

## Visible affordances

- The Tone select shows the new value immediately.
- Prior user turns keep their original badge (e.g. "Reword · Formal") — they are immutable.

## Failure-mode expectations

## Cautions

- Tone selection persists across the sidepanel session — do not reset to Neutral (the default) between turns.
- Tone is captured per turn and shown on the user turn badge; the user can trace why a turn read differently.
