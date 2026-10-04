# Options-display section-reset rubric

## Latency budgets

- SectionReset click -> storage write + knobs revert: <= 200ms.

## State expectations

- Step 1: user modifies a tooltip knob (e.g. disables Click outside to dismiss); SectionReset button appears.
- Step 2 (click SectionReset): the pill and all tooltip knobs revert to DEFAULT_SETTINGS values; SectionReset button hides.
- Step 3: storage reflects the default values for all tooltip knobs.

## Visible affordances

- SectionReset uses the project's SectionReset primitive: a muted pill with a reset icon and the text "Reset pill and tooltip options", accent on hover.
- Button is hidden when all knobs are at default; appears as soon as any knob differs from DEFAULT_SETTINGS.

## Failure-mode expectations

- SectionReset resets the confidence pill knobs and the tooltip knobs, in either mode; `defaultDisplayMode` itself is never reset by this control.
- Storage write failure shows a "Change not saved" warning toast; knobs keep their modified values.

## Cautions

- Reset reverts to DEFAULT_SETTINGS constants, not to the last-saved state — it is a full reset to the shipped defaults.
- In both modes, SectionReset resets Show original selection, Click outside to dismiss, Drag-to-move tooltip, Confidence pill and Confidence threshold. The card groups them under "Tooltip and side panel" and "Tooltip only".
- It never resets the display mode or "Image translation opens in" (`imageTranslateSurface`), and neither one counts as modified.
