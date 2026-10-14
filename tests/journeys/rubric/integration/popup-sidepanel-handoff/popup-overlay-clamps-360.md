# Popup-sidepanel-handoff popup-overlay-clamps-360 rubric

## Latency budgets

- N/A — this is a layout contract.

## State expectations

- Step 1: popup body carries the `data-ega-popup` attribute (empty value).
- Step 2: the body is fixed at 360px; the popover's dim scrim narrows to `--ega-popup-width` (360px) under the attribute.
- Step 3: overlays are positioned within the popup column; never spill into the page beyond it.

## Visible affordances

- The popover primitive's scrim honors the attribute selector; the popover box itself has no width clamp.

## Failure-mode expectations

- An overlay with a hardcoded `width: 500px` is a regression — must use tokens or the popover primitive.
- Language pickers are native `<select>` elements; the browser draws their option lists, not an Ega overlay.

## Cautions

- The CSS gate is `body[data-ega-popup] .ega-popover-scrim { width: var(--ega-popup-width, 360px) }` in Popover.svelte — changes to the popover primitive must preserve it.
- Popup-specific styling lives in the popup entry CSS; do not leak into the global sidepanel / options shell.
