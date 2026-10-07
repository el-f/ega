# Options surface rubric

The options page (`src/options`) is the full-page settings surface. The left rail (icons only below 880px) has two groups: Configuration (Answers, Tasks, Selection and picker, Backends, Languages, Glossary and rules) and System (Advanced, About). Advanced has two sub-tabs, Data (open on landing) and Diagnostics.

## Invariants

- The rail is visible at every width, and the active tab is marked.
- Every control is a design-system primitive.
- Settings search opens with `Ctrl+,` (`Cmd+,` on macOS); Esc closes it.
- Light and dark show the same layout, the same density and the same single filled primary per view.
- The spec 9.3 rules hold: text 12px or larger, at most three text sizes per view, weights 400 and 600 only, no uppercase, card descriptions on one line with no final stop, the red fill only on Delete all data, and a control that does nothing says why in visible text.

## States

- **options-<tab>** / **options-<tab>-notice** — each tab with a backend set up, and on a fresh install with the "No backend is set up yet" notice (Backends shows Get started instead). Full page, light and dark.
- **options-loading** — skeleton rows while the first settings read is slow.
- **options-narrow-880-<tab>** / **options-narrow-600-<tab>** / **options-forced-colors-<tab>** — every tab at 880px, at 600px and with forced colors.
- **options-focus-walk-<tab>-NN** — each stop of the keyboard walk on Answers and Backends.
- **settings-search-*** / **command-palette** / **shortcut-sheet** — search (empty, results, no results, Changed only, the Theme result), the palette and the keyboard shortcut sheet.
- **toast-*** / **infotip-*** — Undo, stacked and error toasts, the save failure, and an (i) on hover, on focus and pinned.
- **answers-*** — Where answers show, Page context and Generation states.
- **tasks-*** / **task-dialog-*** / **custom-task-*** — the task lists, every built-in task dialog with its preview, Insert variable, Reset, Saved, an invalid Message, the version notice and the template diff, and a task of your own from new to delete.
- **selection-*** / **shortcut-recording** / **shortcut-conflict** — the bubble set to Never, the picker off, recording a shortcut and a clash.
- **backends-*** / **backend-*** — the list (Get started, configured, the depth note, checking, all disabled), cloud rows (empty, key saved, models loading and failed, testing, verified, key and test errors), Ollama, the local server and the native host (not installed, steps, installed, update needed, CLI missing).
- **languages-*** / **language-dialog-*** — the list, the filter, many languages, and the language dialog (built-in, auto-detect, own prompt and preview, new, edit, changed in another window, delete).
- **glossary-*** / **rules-*** — empty, add errors, populated, More options, the scope note, editing, delete toasts and long text.
- **data-*** / **delete-all-data-confirm** / **diagnostics-*** / **about** — Advanced Data and Diagnostics in every state, and About.
- **right-click-menu-*** — the Right-click menu card on Selection and picker, shot at the card: `default`, `edit` (one row's options open), `states` (a hidden row, a row whose task is off, the picker row while the picker is off, an added row), `many` (12 rows in Selected text), `infotip` (the (i) tip open), `focus` (keyboard focus on a row's Edit), `full` (50 rows, both Add buttons say the menu is full), `narrow` (options page at 400 px, a row open, no drag grip), `delete-toast` (after deleting an added row). Light and dark. Fail on: more than one control row per menu row outside the open options, row text inside more than 2 borders (a form field in the open options makes 3, which is fine), site-toggle arrows out of line with the other rows, a missing focus ring in `focus`, a reason or label under 12 px, any clipped name or control at 400 px.

## Severity overrides

- Insert-variable popover that covers the chips it sits inside is **major** primitive_coherence.
- Settings search popover stacking that hides its own input is **major** hierarchy.
- Backend card drag handle that overlaps the card body is **minor** density (acceptable if it only fires on hover).
- Unstyled native primitive (default UA `<select>` or checkbox frame) anywhere in the shell is **major** primitive_coherence.
- **Carve-out: token-styled native `<select>`** (the Languages tab default-language pickers + the design-system `Select` primitive's underlying `<select>`) is **NOT** a finding. The shell intentionally wraps native selects so optgroups + ISO entries + custom-language clusters keep working in a single primitive; border, background and focus chrome are token-driven CSS even where the language pickers keep the browser's own chevron. Only mark **major** when the control renders with the fully unstyled default UA frame (no border-radius, no token background, system font fallback) — that signals a missed migration, not the chosen design.
- **Carve-out: native `<select>` chrome inside the tooltip topbar** (`tooltip-loading-dark`, `tooltip-image-inline-dark`) — same reasoning. Tooltip lives inside a shadow host; the design-system Select's token CSS is loaded into the shadow root. Flag only when default UA chrome leaks through unstyled.
