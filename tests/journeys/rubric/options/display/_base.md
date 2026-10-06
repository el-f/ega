# Options-display surface rubric

## Mount + render

- DisplaySurfaceSection mounts at the top of the Translate tab.
- Mode picker (Tooltip / Inline) is two radio cards inside a `role="radiogroup"`.
- A live mini-mock shows both variants side by side; the active variant carries the accent border.

## Mode swap

- Clicking the inactive segment patches `defaultDisplayMode` and re-mounts the knob panel beneath the toggle.
- Tooltip-only knobs (tooltipShowSource, tooltipClickOutside, tooltipDraggable) only render in tooltip mode.
- Inline mode's knob panel shows only the note "Inline mode has no settings of its own."; the confidence pill rows render in both modes.
- There is no image "opens in" select: each right-click image action sets where it opens.

## Reset

- One Reset Section affordance, "Reset pill and tooltip options", appears in either mode when any of its knobs differs from default.
- Reset restores the tooltip knobs plus the confidence pill and threshold in both modes; it never resets `defaultDisplayMode`.
