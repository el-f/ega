# Popup target-lang-pick rubric

## Latency budgets

- Target-lang picker open: <= 100ms.
- Selection -> popup state update: <= 50ms.

## State expectations

- Step 1: popup is mounted; target-lang field shows the active value (persisted user default).
- Step 2 (open picker + choose a language): picker dismisses; field updates; selection persists into the upcoming handoff payload.
- Step 3 (send / panel-handoff): the chosen target lang flows into the request body and sidepanel seed turn.

## Visible affordances

- Picker is a native `<select>` (Built-in, Custom, Languages groups); keyboard works natively.
- Field shows the language label only; no code.

## Failure-mode expectations

## Cautions

- Target-lang persists across popup re-opens (this is the user's working default, not a one-shot choice).
- The handoff is a map keyed by `${ts}-${counter}`; each entry carries `targetLang` as a string, which the sidepanel reads.
