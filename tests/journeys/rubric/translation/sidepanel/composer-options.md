# Sidepanel composer-options rubric

## Latency budgets

- Options button click -> popover visible: <= 200ms.
- A change in the popover -> saved to `ega.settings`: <= 500ms.

## State expectations

- Step 1: the composer's language row ends with a "Message options" button (sliders icon).
- Step 2 (click it): a "Message options" popover opens with Page info (Minimal / Rich), a "Show the reply as it is written" checkbox, and, when earlier messages go with the next send, a "Using N earlier messages" line.
- Step 3 (pick Rich, uncheck the live reply): `pageContextLevel` becomes `rich` and `streaming` becomes `false` in settings; the hint under Page info changes to what Rich sends.
- Step 4 (Escape): the popover closes and focus returns to the options button.

## Visible affordances

- Page info segments carry `aria-pressed`; the hint text for the picked level is visible, not a hover tooltip.
- With page info turned off in Settings, the popover says so and links to Settings instead of showing the level picker.

## Failure-mode expectations

- A settings write that fails reverts the control and shows a toast; the popover does not claim a value that was not saved.

## Cautions

- Both choices are global settings, not per-conversation; the help text says "Applies to every send. Saved in Settings."
