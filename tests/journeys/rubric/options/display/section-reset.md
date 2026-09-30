# Options-display section-reset rubric

## Latency budgets

- SectionReset click -> storage write + knobs revert: <= 200ms.

## State expectations

- Step 1: user modifies a tooltip knob (e.g. disables Click outside to dismiss); SectionReset button appears.
- Step 2 (click SectionReset): all tooltip-mode knobs revert to DEFAULT_SETTINGS values; SectionReset button hides.
- Step 3: storage reflects the default values for all tooltip knobs.

## Visible affordances

- SectionReset uses the project's SectionReset primitive with a reset icon and secondary-danger tone.
- Button is hidden when all knobs are at default; appears as soon as any knob differs from DEFAULT_SETTINGS.

## Failure-mode expectations

- SectionReset resets the active mode's knobs plus the shared confidence pill knobs; `defaultDisplayMode` itself is never reset by this control.
- Storage write failure surfaces an inline error toast; knobs retain their prior modified values.

## Cautions

- Reset reverts to DEFAULT_SETTINGS constants, not to the last-saved state — it is a full reset to the shipped defaults.
- In Tooltip mode, SectionReset resets Show original selection, Click outside to dismiss, Drag-to-move tooltip, Confidence pill and Confidence threshold.
- In Inline mode, it resets only Confidence pill and Confidence threshold.
- It never resets the display mode or "Image translation opens in" (`imageTranslateSurface`), and neither one counts as modified. Switching modes changes which settings count, so it can show or hide the button.
