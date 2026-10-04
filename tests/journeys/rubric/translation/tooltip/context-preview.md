# Tooltip context-preview rubric

## Latency budgets

- Details panel render after the click: <= 150ms.

## State expectations

- Step 1: the request carried surrounding-page `contextSent` (text fragments).
- Step 2: one Details (i) button (`aria-label="Show details about this reply"`) shows in the action row; the panel starts closed.
- Step 3 (click Details): an "About this reply" panel opens under the actions. Its "What Ega sent" part shows the user's text, the task prompt by name with a "View in Settings" link, "Earlier messages: None" in the tooltip, and the page info: title, short address, and the text around the selection with the selection marked. "Show all page info" lists every field; "Copy as JSON" copies it all.

## Visible affordances

- The panel is visually distinct from the result body; each row has a muted label and its value.
- The Details button carries `aria-expanded`; the panel's X ("Close details") and the button both close it.

## Failure-mode expectations

- Page info that was off for the task reads "None. Page info was off."; a reply that recorded none reads "Not recorded for this reply."

## Cautions

- The panel must show what was sent, including the surrounding page text, and nothing the request did not carry. Honesty about what the model saw.
- Page strings may hold sensitive content; the panel must stay inside the tooltip's capped, scrolling details area.
