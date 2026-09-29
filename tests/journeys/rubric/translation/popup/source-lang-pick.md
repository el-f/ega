# Popup source-lang-pick rubric

## Latency budgets

- Source-lang picker open: <= 100ms.
- Selection -> popup state update: <= 50ms.

## State expectations

- Step 1: popup is mounted; source-lang field shows the active value (or "Auto").
- Step 2 (open picker + choose a language): picker dismisses; field updates; selection persists into the upcoming handoff payload.
- Step 3 (send / panel-handoff): the chosen source lang flows into the request body and sidepanel seed turn.

## Visible affordances

- Picker is a `combobox` with type-ahead filter; supports keyboard navigation.
- Field carries the language label + the language code in a subtle muted tone.

## Failure-mode expectations

- Picking an unsupported variety for the active backend surfaces a tooltip / inline notice — never silent.

## Cautions

- "Auto" remains a first-class option; choosing it persists explicitly (not the same as never having opened the picker).
- Source-lang must be persisted into the handoff payload as the keyed map shape that sidepanel reads — not as a string scalar.
