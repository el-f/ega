# Conversation copy-assistant-turn rubric

## Latency budgets

- Copy click -> clipboard ack: <= 200ms.

## State expectations

- Step 1: assistant turn is finalized with a copy control visible.
- Step 2 (click copy): clipboard contains the translation body only — NOT the ResultMeta footer, NOT the task/tone chips.
- Step 3: a feedback marker (icon flash or pill) confirms the copy within 100ms; dismisses within ~1.5s.

## Visible affordances

- Copy control has an aria-label "Copy reply" ("Copied" after a click); hover state visible.
- During stream the control is disabled / hidden.

## Failure-mode expectations

- Clipboard write fails -> no feedback shown; the icon stays Copy and the error is only logged.

## Cautions

- Copy places the reply text as the model wrote it (Markdown source, no rendered HTML); the explain block is not copied.
- The control must NOT steal focus from the composer; copy is a side-effect, not a navigation.
