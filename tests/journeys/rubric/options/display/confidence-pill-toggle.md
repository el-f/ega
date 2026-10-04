# Options-display confidence-pill-toggle rubric

## Latency budgets

- Toggle click -> slider appearance/collapse: <= 200ms (single frame).
- Storage write: <= 200ms.

## State expectations

- Step 1: Translate tab, Display section is open; the Confidence pill toggle is visible.
- Step 2 (enable toggle): `confidencePill` writes `true`; the threshold slider expands below the toggle.
- Step 3 (disable toggle): `confidencePill` writes `false`; the threshold slider collapses and is removed from the DOM.

## Visible affordances

- Toggle uses the project's Checkbox primitive with the label "Confidence pill (tooltip and side panel)".
- Threshold slider only renders when the toggle is enabled; it slides open and closed.
- Slider carries `aria-valuemin/max/now` and a numeric readout.

## Failure-mode expectations

- Storage write failure shows a "Change not saved" warning toast; the stored value stays unchanged.
- Disabling the toggle does NOT delete the persisted threshold value — re-enabling restores the last-set threshold.

## Cautions

- Animation MUST respect `prefers-reduced-motion: reduce`; collapse/expand uses 0ms in that case.
- The threshold slider is only meaningful when the pill is enabled; hiding it when disabled prevents confusion.
