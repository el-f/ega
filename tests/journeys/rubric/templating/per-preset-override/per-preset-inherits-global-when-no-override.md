# Per-preset-override per-preset-inherits-global-when-no-override rubric

## Latency budgets

- Language pick (no override) -> editor seeded from global: <= 200ms.

## State expectations

- Step 1: a preset with no existing override in `perPresetTemplates` is selected.
- Step 2: the TemplateEditor mounts with the body seeded from the global `promptTemplate` body.
- Step 3: the scope marker indicates "Inheriting from Global"; Save is disabled until the user edits the body.

## Visible affordances

- The scope marker uses an info or muted tone ("Inheriting from Global — changes will create a per-preset override").
- Save button is disabled when the body equals the inherited global body.

## Failure-mode expectations

- If the global template is empty (rare edge case), the editor mounts with an empty body — no error.

## Cautions

- The editor body must be seeded from the CURRENT global template, not a cached copy — if the global template was just edited and saved, the preset editor must reflect the latest version.
- Saving an identical copy of the global template as a per-preset override is technically allowed but creates an unnecessary entry; this rubric does not mandate blocking it.
