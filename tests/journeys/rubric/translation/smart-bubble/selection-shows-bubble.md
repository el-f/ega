# Smart-bubble selection-shows-bubble rubric

## Latency budgets

- Selection-change -> bubble first paint: <= 200ms.

## State expectations

- Step 1: user selects eligible text on a page where smart-bubble is enabled.
- Step 2: bubble mounts anchored to the selection's bounding rect.
- Step 3: the bubble persists while the selection is alive; deselect or click-outside dismisses.

## Visible affordances

- Bubble carries an icon + minimal hover/focus state; no full surface chrome.
- The label names what a click runs, the user's default task: "Translate to {target}" while that is Translate; otherwise the task's own name ("Summarize", or a custom task's name). An off default task runs as Translate and says so.
- Bubble is keyboard-focusable so it can be triggered without a mouse.

## Failure-mode expectations

- Selection inside an iframe: no bubble; the content script runs in the top frame only.
- Selection inside a non-eligible context (password field, hidden region): bubble does NOT mount.

## Cautions

- No debounce: each selectionchange re-evaluates and stale results are dropped; while a selection is dragged the bubble moves in place, it does not remount.
- Bubble must NOT obscure the selected text itself; position above OR below based on viewport space.
