# Options surface rubric

The options shell (`src/options`) is the full-page settings surface. The left nav rail (icon-only below 880px) navigates between Translate, Selection & picker, Backends, Languages, Templates, Glossary, Advanced (sub-tabs Diagnostics / Data / Labs) and About.

## Invariants

- Left nav rail visible at all times (sticky). Active tab clearly indicated.
- All form controls are design-system primitives.
- Settings search modal opens via `Cmd+,` / `Ctrl+,` — fuzzy input + result list; ESC dismisses.
- Theme parity: light/dark must render the same nav rail position, same primary CTA, same density.
- Advanced sub-tabs: a strip of three (`[data-ega-subtab]`) — Diagnostics, Data, Labs — with Diagnostics active on landing. The Templates chip strip (`[data-ega-workbench-chip]`) is a DIFFERENT tab; it does not appear on Advanced.

## States

- **landing** — Advanced tab open; Diagnostics sub-tab active. Captured light and dark.
- **translate** / **selection-bubble** / **backends** / **languages** / **templates** / **about** — each top tab. Captured light and dark.
- **subtab-diagnostics** / **subtab-data** / **subtab-labs** — the Advanced sub-tabs.
- **settings-search-empty** / **settings-search-temperature** — search modal with an empty query / mid-query.
- **onboarding-banner-display** / **onboarding-banner-backends** — the first-run banner, shot on the Translate tab and on the Backends tab.
- **toast-success** — a toast after an action succeeds.
- **confirm-delete-all-data** — the About tab's Delete all data confirm, shot in dark with DELETE typed. The danger CTA is enabled and its label is dark text on red.

## Severity overrides

- Insert-variable popover that covers the chips it sits inside is **major** primitive_coherence.
- Settings search popover stacking that hides its own input is **major** hierarchy.
- Backend card drag handle that overlaps the card body is **minor** density (acceptable if it only fires on hover).
- Unstyled native primitive (default UA `<select>` or checkbox frame) anywhere in the shell is **major** primitive_coherence.
- **Carve-out: token-styled native `<select>`** (Translate tab language pickers + the design-system `Select` primitive's underlying `<select>`) is **NOT** a finding. The shell intentionally wraps native selects so optgroups + ISO entries + custom-language clusters keep working in a single primitive; border, background and focus chrome are token-driven CSS even where the language pickers keep the browser's own chevron. Only mark **major** when the control renders with the fully unstyled default UA frame (no border-radius, no token background, system font fallback) — that signals a missed migration, not the chosen design.
- **Carve-out: native `<select>` chrome inside the tooltip topbar** (`tooltip-loading-dark`, `tooltip-image-inline-dark`) — same reasoning. Tooltip lives inside a shadow host; the design-system Select's token CSS is loaded into the shadow root. Flag only when default UA chrome leaks through unstyled.
