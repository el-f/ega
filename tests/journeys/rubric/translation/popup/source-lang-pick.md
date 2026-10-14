# Popup source-lang-pick rubric

## Latency budgets

- Source-lang picker open: <= 100ms.
- Selection -> popup state update: <= 50ms.

## State expectations

- Step 1: popup is mounted; source-lang field shows the active value (or "Auto-detect").
- Step 2 (open picker + choose a language): picker dismisses; field updates; selection persists into the upcoming handoff payload.
- Step 3 (send / panel-handoff): the chosen source lang flows into the request body and sidepanel seed turn.

## Visible affordances

- Picker is a native `<select>` (an Auto-detect option, then Built-in, Custom, Languages groups); keyboard works natively.
- Field shows the language label only; no code.

## Failure-mode expectations

## Cautions

- "Auto" remains a first-class option; choosing it persists explicitly (not the same as never having opened the picker).
- The handoff is a map keyed by `${ts}-${counter}`; each entry carries `sourceLang` as a string, which the sidepanel reads.
