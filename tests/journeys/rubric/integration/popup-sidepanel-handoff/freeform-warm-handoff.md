# Popup-sidepanel-handoff freeform-warm-handoff rubric

## Latency budgets

- Send-to-panel click -> sidepanel UserTurn render: <= 400ms (warm; no cold-start cost).

## State expectations

- Step 1: sidepanel is ALREADY open. User types in popup freeform; clicks Send-to-panel.
- Step 2: a `chrome.runtime` message dispatches with the payload; popup closes; sidepanel receives the message.
- Step 3: a new UserTurn appears in the existing conversation; assistant turn begins streaming.

## Visible affordances

- Warm-handoff is a single-frame insertion — no scroll jump, no animation flash.
- Existing conversation history is preserved; the popup turn appears at the end.

## Failure-mode expectations

- Message dispatch failure falls back to the storage-channel path; the seeded turn might land slightly later (still < cold-start budget).

## Cautions

- Warm-handoff must NOT clear the conversation. The popup turn appends; it doesn't reset.
- The popup's `chrome.runtime` message ID must be unique enough to not collide with internal sidepanel events.
