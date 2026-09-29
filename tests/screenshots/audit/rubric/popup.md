# Popup surface rubric

The popup is the toolbar-button surface (`src/popup`). Captured at 380x600; the popup body is 360px wide. Chrome enforces both bounds, so any overflow OR scroll-bar inside the popup is a layout failure that ships to every user.

The popup is a LAUNCHER, not a workbench. It hands every translate path off to the sidepanel via `pendingPopupHandoff` and never renders translation output. The command palette, the shortcut overlay and the site popover belong in the sidepanel. The header is the deliberate exception: it carries the active-backend chip and the theme toggle, both of which the user needs before launching anything.

## Invariants

- Body width 360px; height <= 600px. A vertical scrollbar inside the chrome is allowed only when content genuinely exceeds 600 — the default surface must NOT scroll.
- Header carries, left to right: the brand mark, then the active-backend chip (`ActiveBackendChip`, hidden until settings hydrate), the theme toggle and the Options gear. Nothing else.
- Lang pair (source / swap / target) renders below the header. Native `<select>` is OK inside `LanguagePicker` (a primitive), but visible chrome must stay token-aligned.
- Trigger grid (`[data-ega-popup-tools]`) renders four tiles: "Translate this page", "Pick element", "Translate clipboard", "Side panel". Tiles are token-styled cards with icon + label.
- Collapsed freeform entry sits below the grid — clicking expands an inline textarea + "Send to panel" CTA.
- No Toaster mount, no command palette, no shortcut overlay, no site popover — those live in the sidepanel now.

## States

- **default** — four trigger tiles + lang pair + collapsed freeform input.
- **default-dark** — same layout in `data-theme=dark`; tokens shift, structure unchanged.
- **freeform-expanded** — freeform clicked; textarea + Send button visible; trigger tiles still reachable.

## Severity overrides

- Inline translation rendered in the popup body (any visible model output) is **major** — the launcher must NEVER own translation surface.
- Native `<select>` outside the `LanguagePicker` primitive is **major** primitive_coherence failure.
- Body width drift > 4px from 360px is **major** overflow.
- Surfacing per-site controls in the popup chrome is **major** — those moved to the sidepanel deliberately.
- The header's backend chip and theme toggle are expected. Their ABSENCE is the failure, not their presence.
