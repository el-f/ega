# Tooltip-sidepanel-escalation retry-escalates-to-sidepanel rubric

## Latency budgets

- Continue-in-sidepanel click -> sidepanel open + first turn: <= 800ms.

## State expectations

- Step 1: tooltip translate fails (any error state with source text).
- Step 2: a "Continue in side panel" secondary affordance surfaces in the tooltip error state.
- Step 3 (click): tooltip closes; sidepanel opens and sends the source text as a new UserTurn (a fresh request).

## Visible affordances

- The CTA uses a secondary action token (not primary — primary is still Retry).
- When the handoff changes the pickers, the panel shows a "Language, task and tone set from your selection" toast with Undo.

## Failure-mode expectations

- Sidepanel open failure -> the tooltip stays mounted; a page toast says "Could not open the side panel."; Retry stays available.

## Cautions

- The escalation must preserve the user's source text, tone, target language verbatim — no loss across surfaces.
- After the panel opens, the tooltip closes and ends its own request.
