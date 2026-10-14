# Picker overlay rubric

Element-picker overlay (`src/content/PickerOverlay.svelte`) mounts in the content-script shadow host on `picker:enter`. Full-page semi-transparent dimmer; hovering a pickable element paints an outline at its rect; clicking commits the target.

## Invariants

- Overlay covers the full viewport. Dimmer alpha ~0.30; should be enough to mark "picker mode active" without obscuring page content.
- Hovered element gets an outline drawn at its bounding rect (`.picker-outline`), and the dim is cut out around it: the target is as bright as the page, everything else is dimmed.
- Escape exits without firing a translate.
- Sensitive targets (password, card, one-time-code fields, editable text) get a red outline and the hint swaps to the reason Ega will not read them; clicking one shows a toast and translates nothing.
- A hint banner pinned to the BOTTOM center reads "Click an area to translate it, or use ↑ ↓ to make it larger or smaller and Tab for the next one, then Enter · Esc to cancel".
- The overlay mounts once per picker session. A hover repaints the outline in place — it must not replace the hint node, or the `aria-live` region is destroyed on every mouse move.

## States

- **overlay-empty** — picker mode active; no hover; only dim + hint banner visible.
- **overlay-active** — hovering a pickable element; outline drawn at its rect.

## Severity overrides

- Overlay that does NOT cover the full viewport (gaps at the edges) is **major** overflow.
- Outline that lags the cursor or paints at the wrong rect is **major** primitive_coherence — but only flag if the outline is visibly off-target in the capture, not just because the cursor isn't shown.
- Hint banner missing in `overlay-empty` is **minor** copy / empty_state (depending on what's missing).
