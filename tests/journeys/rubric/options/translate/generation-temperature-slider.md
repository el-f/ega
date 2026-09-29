# Options-translate generation-temperature-slider rubric

## Latency budgets

- ArrowRight/ArrowLeft on slider -> readout update: <= 1 frame.
- Slider commit (blur / pointer-up) -> storage write: <= 300ms.

## State expectations

- Step 1: user opens Translate tab; global temperature slider is visible with its current value.
- Step 2 (ArrowRight): slider increments; numeric readout beside it updates immediately.
- Step 3 (commit): `advanced.temperature` persists to storage; subsequent translates use the new value.
- Step 4 (click ResetField): temperature reverts to the schema default; storage writes the default.

## Visible affordances

- Slider uses the project's Slider primitive with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`.
- A ResetField arrow icon sits next to the slider; shows only when value differs from default.
- Numeric readout uses a ConfidencePill-style label.

## Failure-mode expectations

- Values below 0 or above 2 are clamped to the slider boundary; no out-of-range write.
- Storage write failure surfaces an inline error toast; slider snaps back to last persisted value.

## Cautions

- Storage write happens on commit, not on every ArrowKey event.
- Per-task overrides take precedence at dispatch time; global temperature is the fallback when no override exists.
