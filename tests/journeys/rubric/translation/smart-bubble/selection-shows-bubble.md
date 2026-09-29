# Smart-bubble selection-shows-bubble rubric

## Latency budgets

- Selection-change -> bubble first paint: <= 200ms.

## State expectations

- Step 1: user selects eligible text on a page where smart-bubble is enabled.
- Step 2: bubble mounts anchored to the selection's bounding rect.
- Step 3: the bubble persists while the selection is alive; deselect or click-outside dismisses.

## Visible affordances

- Bubble carries an icon + minimal hover/focus state; no full surface chrome.
- Bubble is keyboard-focusable so it can be triggered without a mouse.

## Failure-mode expectations

- Selection inside an iframe with same-origin: bubble mounts inside the iframe document.
- Selection inside a non-eligible context (password field, hidden region): bubble does NOT mount.

## Cautions

- Bubble must NOT mount on rapid selection-change events — debounce to the final stable selection.
- Bubble must NOT obscure the selected text itself; position above OR below based on viewport space.
