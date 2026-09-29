# Popup-sidepanel-handoff popup-overlay-clamps-360 rubric

## Latency budgets

- N/A — this is a layout contract.

## State expectations

- Step 1: popup body carries `data-ega-popup="true"`.
- Step 2: any overlay (combobox, tooltip, popover) mounting inside the popup clamps its width to 360px.
- Step 3: overlays are positioned within the popup column; never spill into the page beyond it.

## Visible affordances

- Overlays use the project popover primitive which honors the attribute selector.

## Failure-mode expectations

- An overlay with a hardcoded `width: 500px` is a regression — must use tokens or the popover primitive.
- A combobox option list longer than the popup height scrolls inside the overlay; never extends past the popup window.

## Cautions

- The CSS gate is `body[data-ega-popup] .popover { max-width: 360px }` — changes to the popover primitive must preserve this gate.
- Popup-specific styling lives in the popup entry CSS; do not leak into the global sidepanel / options shell.
