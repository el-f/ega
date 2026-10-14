# Tooltip-sidepanel-escalation tooltip-explain-then-sidepanel-pin rubric

## Latency budgets

- Pin-to-sidepanel click -> sidepanel mount with seeded turn: <= 800ms.

## State expectations

- Step 1: user has completed an Explain in the tooltip; the explanation is finalized.
- Step 2 (click Pin): tooltip closes; sidepanel opens and sends the source text as a new request; the tooltip's explanation rides along on the new AssistantTurn.
- Step 3: the conversation is ready for follow-ups; the next user message inherits the context.

## Visible affordances

- The pinned explanation shows under the reply's "Context & subtext" block; there is no origin marker.
- ResultMeta of the assistant turn comes from the panel's new request, not the tooltip.

## Failure-mode expectations

- Sidepanel open failure -> the tooltip stays mounted; a page toast says "Ega couldn't open the side panel. Try again."

## Cautions

- Pin re-sends the source text as a new translate request; the tooltip's explanation rides along verbatim and is not re-generated.
- Pin shows from the first streamed token; clicking it mid-stream closes the tooltip and stops its request.
