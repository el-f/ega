# Tooltip-sidepanel-escalation escalate-continue-seeds-sidepanel rubric

## Latency budgets

- Continue-in-sidepanel click -> sidepanel open + fresh UserTurn dispatched: <= 800ms.

## State expectations

- Step 1: tooltip is in an error or retry-exhausted state with source text present.
- Step 2: user clicks "Continue in side panel" CTA.
- Step 3: sidepanel opens; `conversation.send` is called with the source text as a fresh UserTurn (not a seeded read-only turn); the assistant turn begins streaming.

## Visible affordances

- The seeded UserTurn in the sidepanel is a normal interactive turn — the user can edit-last or send a follow-up.
- The sidepanel composer is empty and active after the fresh UserTurn dispatches.

## Failure-mode expectations

- Sidepanel open failure -> tooltip stays mounted; inline error surfaces.
- A fresh dispatch failure in the sidepanel -> error on the assistant slot with the standard retry affordance.

## Cautions

- This path differs from Pin: `conversation.send` fires a new backend request — it does NOT seed a pre-completed response.
- Source text, tone, and target language from the tooltip are preserved in the dispatched UserTurn.
- The tooltip must dismiss after the sidepanel opens — it must not stay mounted simultaneously.
