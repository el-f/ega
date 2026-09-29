# Options-display surface rubric

## Mount + render

- DisplaySurfaceSection mounts at the top of the Translate tab.
- Segmented mode toggle (Tooltip / Inline) renders with `role="radiogroup"`.
- A live mini-mock shows both variants side by side; the active variant carries the accent border.

## Mode swap

- Clicking the inactive segment patches `defaultDisplayMode` and re-mounts the knob panel beneath the toggle.
- Tooltip-only knobs (imageTranslateSurface, tooltipShowSource, tooltipClickOutside, tooltipDraggable) only render in tooltip mode.
- Inline mode renders an explainer card + the confidence pill row.

## Reset

- A per-mode Reset Section affordance appears when any knob differs from default.
- Reset restores only the active mode's knobs; `defaultDisplayMode` itself is never reset by this control.
