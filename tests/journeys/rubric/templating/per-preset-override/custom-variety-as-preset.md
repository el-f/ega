# Per-preset-override custom-variety-as-preset rubric

## Latency budgets

- Language selector open -> custom language visible in Custom optgroup: <= 200ms.
- Pick -> save -> storage write under custom id: <= 300ms.

## State expectations

- Step 1: a custom language is seeded in `customLanguages`; user opens the per-preset panel.
- Step 2: the Language selector shows the custom language listed under a "Custom" optgroup.
- Step 3 (pick the custom language, edit body, Save): `perPresetTemplates[customLanguageId]` is written to storage using the custom language's id.

## Visible affordances

- The "Custom" optgroup is distinct from the built-in language groups in the selector.
- The scope marker inside the editor names the custom language label.

## Failure-mode expectations

- A custom language that was deleted while the per-preset panel is open: the Language selector no longer lists it; if the user had it selected, the editor unmounts with an inline notice.

## Cautions

- Custom language ids are user-defined strings; storage key `perPresetTemplates[id]` must use the exact id, not a display label.
- Custom languages are rendered in the selector alongside built-in languages — the "Custom" optgroup is a grouping aid, not a separate UI page.
