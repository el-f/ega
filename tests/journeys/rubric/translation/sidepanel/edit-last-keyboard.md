# Sidepanel edit-last-keyboard rubric

## Latency budgets

- e key press -> last UserTurn text in composer: <= 100ms.

## State expectations

- Step 1: at least one UserTurn + AssistantTurn pair is present in the conversation; composer is empty and focused (or page-level focus on sidepanel).
- Step 2: user presses the e key; the last UserTurn's text is pulled into the composer for editing.
- Step 3: user edits and presses Send (Enter); the conversation now has exactly 2 UserTurns rendered (original + edited re-send).

## Visible affordances

- Composer fills with the last UserTurn text immediately on e key press.
- The cursor is at the end of the text (or full-select) so the user can type to replace.
- The last UserTurn in the conversation remains visible above during editing.

## Failure-mode expectations

- e key with no prior UserTurn -> no-op (nothing to pull into composer).
- e key during an active stream -> no-op; pulling while streaming could corrupt context.

## Cautions

- The re-send must append a NEW UserTurn — it must not overwrite the prior UserTurn in place. After the test, exactly 2 UserTurns must be visible.
- The edit-pull must not discard any in-progress composer text silently; if the composer is non-empty, the user should be warned or the pull should be blocked.
