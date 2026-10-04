# Sidepanel edit-last-keyboard rubric

## Latency budgets

- e key press -> last UserTurn text in composer: <= 100ms.

## State expectations

- Step 1: at least one UserTurn + AssistantTurn pair is present; the composer is empty and focus is outside it (on the stream or a turn card).
- Step 2: user presses the e key; the last UserTurn's text is pulled into the composer for editing.
- Step 3: user edits and sends (Send button or Ctrl+Enter); the edited message replaces the last exchange, and the old reply stays as the earlier variant (2/2) on the new answer.

## Visible affordances

- Composer fills with the last UserTurn text immediately on e key press.
- Focus does not move: the text lands in the composer and an "Editing your last message" banner appears above it; press c or click the box to type.
- The last UserTurn in the conversation remains visible above during editing.

## Failure-mode expectations

- e key with no prior UserTurn -> no-op (nothing to pull into composer).
- e key during an active stream -> nothing is pulled; a warning toast says "Edit when this reply finishes."

## Cautions

- The re-send replaces the last exchange — it must not append a duplicate UserTurn; the replaced reply survives as a variant on the new answer.
- The edit-pull must not discard any in-progress composer text silently; if the composer is non-empty, the user should be warned or the pull should be blocked.
