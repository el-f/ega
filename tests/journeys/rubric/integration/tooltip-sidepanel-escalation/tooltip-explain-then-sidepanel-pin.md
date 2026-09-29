# Tooltip-sidepanel-escalation tooltip-explain-then-sidepanel-pin rubric

## Latency budgets

- Pin-to-sidepanel click -> sidepanel mount with seeded turn: <= 800ms.

## State expectations

- Step 1: user has completed an Explain in the tooltip; the explanation is finalized.
- Step 2 (click Pin): tooltip dismisses; sidepanel opens (or comes to focus) with a seed conversation including the original request + the explanation as a UserTurn + AssistantTurn pair.
- Step 3: the conversation is ready for follow-ups; the next user message inherits the context.

## Visible affordances

- The seeded turns carry "from tooltip Explain" markers so the user knows the origin.
- ResultMeta of the seeded assistant turn matches what the tooltip showed.

## Failure-mode expectations

- Sidepanel API failure -> the tooltip stays mounted; an inline notice surfaces.
- The tooltip's local ResultMeta must be available when seeding; if not (older state), seed without the meta.

## Cautions

- The Pin action must NOT re-fire the explain — the result is captured and seeded verbatim.
- Cancellation: the tooltip cannot be in-flight at Pin time; Pin is gated on stream completion.
