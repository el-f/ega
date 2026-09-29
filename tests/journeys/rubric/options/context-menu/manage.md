# Options context-menu manage rubric

## Mount + render

- The Translate tab renders ONE "Context menu" card: a Layout (Nested/Flat) radio at the top, then one row per `contextMenuItems` entry.
- The Layout toggle and the "Reset section" control live in the SAME card — changing the layout must not flip a reset on a different section.
- Each item row shows: drag handle, enable checkbox, kind icon, label input, a context chip ("Text selection" / "Image" / "Page"), up/down reorder, delete.
- Task and image-task rows expand a detail row: Task select, "Open in" (Tooltip / Side panel), and for text actions an "Into" target-language picker.

## State expectations

- Toggle/label/reorder/add/delete/target-lang each persist to `contextMenuItems` (or `contextMenuLayout`) via `onPatch` immediately; no batch-submit.
- Order renormalizes to a clean 0..n-1 sequence on every reorder (drag, up/down, add).
- Target language "Auto-detect" clears the per-item `targetLang` so the click inherits `defaultTargetLang`; a concrete pick stores it.

## Visible affordances

- Drag handle reads as draggable (grab cursor) and is keyboard-focusable.
- Reset-to-defaults appears only when items or layout differ from defaults; hides again at defaults.
- Singleton items (whole-page, pick-element, site-toggle) have a disabled delete with an explanatory tooltip.

## Failure-mode expectations

- An empty label flags visually but never crashes registration; the row stays editable.
- Deleting down to zero non-singleton items still leaves the singletons; the menu never registers nothing unexpectedly.

## Cautions

- Reorder must not drop or duplicate rows mid-drag (shadow-placeholder handling).
- Editing here is the only writer of `contextMenuItems`/`contextMenuLayout`; the background re-registers on the settings change.
