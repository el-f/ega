# Sidepanel tone-switch-convo rubric

## Latency budgets

- Tone picker open: <= 100ms.
- New-tone first token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: sidepanel has an ongoing conversation with tone X (formal).
- Step 2 (open tone picker + choose tone Y): the NEXT user message routes under tone Y; prior turns retain their original tone labels.
- Step 3: the next assistant turn applies the new tone; conversation history still feeds in as context.

## Visible affordances

- Active tone chip updates immediately.
- Prior turns retain their original tone chip — they are immutable.

## Failure-mode expectations

- Switching to an unsupported tone for the active backend surfaces a tooltip / inline warning before next send.

## Cautions

- Tone selection persists across the sidepanel session — do not reset to "formal" between turns.
- Tone is recorded per-turn in audit log; the user can trace why a turn read differently.
