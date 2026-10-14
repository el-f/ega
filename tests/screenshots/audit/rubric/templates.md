# Prompts and rules rubric

There is no Templates tab any more. Prompts are edited in each task's edit dialog on the Tasks tab (`src/options/components/TaskEditDialog.svelte`), one language's prompt in that language's dialog on the Languages tab, and rules in the Rules card of the Glossary and rules tab. The shot names keep their old `templates-` prefix.

## Invariants

- The Translate dialog edits the Translate prompt, which Explain and every language without its own prompt use. Summarize, Reword, Grammar, Reply ideas and Ask each edit their own prompt. Explain shows a line that names the prompt it uses, and no editor.
- The editor is two plain textareas (Instructions / Message) that always show the raw template, with a collapsed "Preview what the model receives" section beneath.
- Slot palette ("Variables") sits above the editor, always open; hover on a slot pill shows a registry tooltip.
- Insert-variable popover anchors to the trigger button and must NOT cover the slot palette above it, and must stay usable inside the dialog.
- Rules empty state explains how to add a rule and has an "Add a rule" button; no rule form shows until that button is pressed.
- A language prompt opens inside its language row, under "Prompt for this language".

## States

- **templates-<task>** — one capture per task dialog: `translate`, `explain`, `summarize`, `reword`, `grammar`, `suggest-replies`, `ask`.
- **global-detail** — the Translate dialog; raw template + slot palette visible.
- **global-slot-hover** — hovering a slot pill to show the registry tooltip.
- **insert-variable-open** — Insert-variable popover open.
- **rules-empty** — the Rules section with no rules; empty state covered explicitly.

### Rules and per-language states

- **rules-editor-populated** — rules list with host-scoped + task-scoped + always-disabled rules seeded. Scope chips (host name, task name) must be visible per row; a rule that is off shows an "Off" badge and a dashed border, with its text at full contrast (no opacity).
- **rules-editor-add-form-open** — the "Add a rule" `<details>` expanded. Body textarea + Tasks chip row + Sites input + Add rule CTA all visible inside the expanded panel.
- **rules-editor-empty** — zero rules. The "No rules yet" empty-state card renders, with a hint on how to add one.
- **per-preset-override-active** — the Arabizi row's prompt editor with an override seeded. The "Clear" reset action MUST be visible to show the language has its own prompt.
- **slot-palette-insert-open** — Insert-variable popover open above the editor. Popover MUST NOT cover the slot palette pills.

### Severity overrides for those states

- Rules editor that does not visually distinguish disabled rows from enabled rows is **major** hierarchy — the toggle is meaningless if both states look identical.
- A language prompt editor that does not make clear it belongs to that one language is **major** primitive_coherence.
- Slot palette insert popover that covers the slot palette pills is **major** primitive_coherence (already pinned for global-insert-variable; reaffirmed for slot-palette-insert-open).

## Severity overrides

- Insert-variable popover that covers the slot palette it lives inside is **major** primitive_coherence (pinned by `SlotPalette` collision-flip caps).
- Rules empty state with no hint on how to add a rule is **major** empty_state.
- A task dialog whose prompt editor renders empty or stuck loading is **major** hierarchy.
- Cmd+, modal not auto-focusing the input is **minor** hierarchy.
