# Sidepanel edit-last-keyboard rubric

## Latency budgets

- e key press -> last message text in the composer: <= 100ms.

## State expectations

- Step 1: at least one message and reply are present; the composer is empty and focus is on a message or reply, not in the box.
- Step 2: the user presses e; the last message's text is pulled into the composer, and "Editing your message ×" replaces the mode chip. The edited bubble gets an accent outline.
- Step 3: the user edits and sends (Enter or Send); the edited message replaces the last exchange, and the old reply stays as version 1 of the new answer (pager 2/2).

## Visible affordances

- Esc or × leaves edit mode and restores the earlier draft; the exchange is untouched.
- The edited message stays visible above the composer while editing.

## Failure-mode expectations

- e with no message -> nothing happens.
- e while a reply runs -> nothing is pulled; a warning toast says "Edit when this reply finishes."

## Cautions

- The re-send replaces the last exchange — it must not append a duplicate message; the replaced reply survives as a version of the new answer.
- The edit pull must not silently discard text already in the composer: a toast asks to clear the box first.
