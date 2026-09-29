# Popup target-lang-pick rubric

## Latency budgets

- Target-lang picker open: <= 100ms.
- Selection -> popup state update: <= 50ms.

## State expectations

- Step 1: popup is mounted; target-lang field shows the active value (persisted user default).
- Step 2 (open picker + choose a language): picker dismisses; field updates; selection persists into the upcoming handoff payload.
- Step 3 (send / panel-handoff): the chosen target lang flows into the request body and sidepanel seed turn.

## Visible affordances

- Picker is a `combobox` with type-ahead filter; supports keyboard navigation.
- Field surfaces the language label + the language code in a subtle muted tone.

## Failure-mode expectations

- Choosing the same target as the source surfaces an inline warning (not a hard block) — the user might want literal identity passthrough.

## Cautions

- Target-lang persists across popup re-opens (this is the user's working default, not a one-shot choice).
- Target-lang must flow through the handoff payload as the keyed map shape that sidepanel reads.
