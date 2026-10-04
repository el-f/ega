# Options-display surface rubric

## Mount + render

- DisplaySurfaceSection mounts at the top of the Translate tab.
- Mode picker (Tooltip / Inline) is two radio cards inside a `role="radiogroup"`.
- A live mini-mock shows both variants side by side; the active variant carries the accent border.

## Mode swap

- Clicking the inactive segment patches `defaultDisplayMode` and re-mounts the knob panel beneath the toggle.
- Tooltip-only knobs (tooltipShowSource, tooltipClickOutside, tooltipDraggable) only render in tooltip mode; imageTranslateSurface renders in both modes.
- Inline mode's knob panel shows only the note "Inline mode has no settings of its own."; the image-surface select and confidence pill rows render in both modes.

## Reset

- A per-mode Reset Section affordance appears when any knob differs from default.
- Reset restores the active mode's knobs plus the confidence pill and threshold; it never resets `defaultDisplayMode` or `imageTranslateSurface`.
