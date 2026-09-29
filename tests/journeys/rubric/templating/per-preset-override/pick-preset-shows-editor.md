# Per-preset-override pick-preset-shows-editor rubric

## Latency budgets

- Language pick -> editor mount with seeded body: <= 200ms.

## State expectations

- Step 1: user navigates to per-preset overrides; sees a language selector.
- Step 2 (pick a language): the TemplateEditor mounts below seeded with either the existing override body OR the inherited default.
- Step 3: a scope marker is visible inside the editor naming the active language.

## Visible affordances

- The language selector is a combobox with type-ahead.
- The scope marker uses an info tone token so the user knows they're editing an override, not the Global.

## Failure-mode expectations

- An invalid language id (e.g., deleted while open) surfaces an inline notice; editor unmounts.

## Cautions

- The editor must NOT mount when no language is picked — show the empty selector only.
- Picking a different language with unsaved changes surfaces a confirm dialog.
