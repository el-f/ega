# Templates surface rubric

Templates is its own top tab in the Options shell (`src/options/tabs/Templates.svelte`). It is the workbench for editing the prompt templates Ega sends to each LLM backend.

## Invariants

- Chip strip across the top selects which template family is shown. Scope chips: `global` and one per task (`translate`, `explain`, `summarize`, `reword`, `grammar`, `suggest-replies`, `ask`). Override chips: `rules`, `recipes`, `per-preset`, `snippets`.
- Editor below the chip strip is CodeMirror 6 — show-raw toggle reveals the underlying mustache template.
- Slot palette (variables you can insert) is collapsible; hover on a slot pill shows a registry tooltip.
- Insert-variable popover anchors to the trigger button and must NOT cover the chip strip ABOVE it.
- Rules empty state offers an explicit CTA + explanation.
- Recipes is a list of bundled prompt recipes; each card has Apply + (sometimes) Use rules only. Primary action should be clearly weighted over secondary.
- Snippets + Per-preset share the workbench pattern: tabbed strip + single editor (NOT N stacked cards).

## States

- **chip-<id>** — one capture per chip: `global`, `translate`, `explain`, `summarize`, `reword`, `grammar`, `suggest-replies`, `per-preset`, `snippets`, `rules`, `recipes`. The editor shows that chip's template or manager.
- **global-detail** — Global chip; raw template + slot palette visible.
- **global-slot-hover** — hovering a slot pill to show the registry tooltip.
- **insert-variable-open** — Insert-variable popover open.
- **rules-empty** — rules layer with no rules; empty state covered explicitly.
- **recipes** — bundled recipes list.
- **confirm-delete-rule** — delete-rule confirm dialog open.

### Rules, snippets and recipes states

- **rules-editor-populated** — rules list with host-scoped + task-scoped + always-disabled rules seeded. Scope chips (host name, task name) must be visible per row; disabled rows must be visually distinct from enabled rows (dim/strikethrough/opacity, not just an icon toggle).
- **rules-editor-add-form-open** — manual-add form `<details>` expanded. Body textarea + Tasks chip row + Sites input + Add rule CTA all visible inside the expanded panel.
- **rules-editor-empty-with-describe** — zero rules. Describe-your-change input + Apply CTA sit above the empty-state card with "Pick a recipe" CTA.
- **describe-change-loading** — Apply clicked, LLM call in flight. Apply button is in its loading spinner state; input is disabled; "Asking your model…" busy label visible.
- **describe-change-result** — LLM resolved, new rule appended. Exactly one new rule row; input is empty + re-enabled.
- **snippets-list-populated** — snippet manager with ≥3 snippets. Each row exposes name + body textarea + rename + delete affordances.
- **snippets-add-form-open** — "+ New snippet" clicked, new empty row appended for editing.
- **per-preset-override-active** — per-preset workbench with an active override seeded. The "Clear language override" reset action MUST be visible to distinguish override from inheritance.
- **templates-recipes-filtered** — recipes gallery with a task-filter chip active. The active filter must be visually distinguishable AND the card count narrows.
- **templates-recipes-apply-pending** — Apply clicked on a structured recipe; confirm Dialog open with a diff summary, primary Apply + secondary Cancel inside, scrim covers the underlying gallery uniformly.
- **slot-palette-insert-open** — Insert-variable popover open above the editor. Popover MUST NOT cover the slot palette pills or the chip strip.

### Severity overrides for those states

- Rules editor that does not visually distinguish disabled rows from enabled rows is **major** hierarchy — the toggle is meaningless if both states look identical.
- Describe-change loading state without a visible busy affordance (spinner OR label) is **major** empty_state — user has no signal the LLM call is in flight.
- Per-preset override editor that does not visually mark the active scope (override vs inherited) is **major** primitive_coherence — the whole point of the surface is to make scope explicit.
- Recipes apply-confirm dialog that lets the underlying recipe card stay fully bright (no scrim, no dim) is **major** scrim.
- Slot palette insert popover that covers the slot palette pills is **major** primitive_coherence (already pinned for global-insert-variable; reaffirmed for slot-palette-insert-open).

## Severity overrides

- Insert-variable popover that covers the chip strip OR the slot palette it lives inside is **major** primitive_coherence (pinned by `SlotPalette` collision-flip caps).
- Rules empty state without a CTA is **major** empty_state.
- Recipes card without primary/secondary action weighting (Apply vs. Use rules only equal weight) is **minor** hierarchy.
- Raw template toggle that leaves the editor empty / unloaded is **major** hierarchy.
- Cmd+, modal not auto-focusing the input is **minor** hierarchy.
