# Conversation copy-assistant-turn rubric

## Latency budgets

- Copy click -> clipboard ack: <= 200ms.

## State expectations

- Step 1: assistant turn is finalized with a copy control visible.
- Step 2 (click copy): clipboard contains the translation body only — NOT the ResultMeta footer, NOT the task/tone chips.
- Step 3: a feedback marker (icon flash or pill) confirms the copy within 100ms; dismisses within ~1.5s.

## Visible affordances

- Copy control has an aria-label "Copy translation"; hover state visible.
- During stream the control is disabled / hidden.

## Failure-mode expectations

- Clipboard permission denied -> inline error inside the turn (not a vanishing toast).

## Cautions

- Copy must place only the user-facing translation text — strip any internal markup.
- The control must NOT steal focus from the composer; copy is a side-effect, not a navigation.
