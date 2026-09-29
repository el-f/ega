# Per-preset-override surface rubric

## Mount + scope

- Surface lists configured presets; picking one surfaces the TemplateEditor seeded with the preset's override body (or the inherited default).
- Scope marker is visible inside the editor — the user must know they are editing an override, not the Global.

## Save + clear

- Save persists to `perPresetTemplates[preset]`.
- Clear (reset) removes the override entry; the preset falls back to inherited.

## Disabled state

- When no language is picked, the editor is hidden — never shown empty with no scope.
