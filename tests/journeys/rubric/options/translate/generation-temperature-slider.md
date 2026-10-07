# Options-translate generation-temperature-slider rubric

## Latency budgets

- ArrowRight/ArrowLeft on slider -> readout update: <= 1 frame.
- Slider commit (blur / pointer-up) -> storage write: <= 300ms.

## State expectations

- Step 1: user opens the Answers tab; the global "Creativity (temperature)" slider is visible with its current value.
- Step 1b: the Effort note under the Effort control names what the level does on the first backend that can run. A cloud backend counts only once its key is saved; the keyless native CLI always counts.
- Step 2 (ArrowRight): slider increments; numeric readout beside it updates immediately.
- Step 3: each value change (every ArrowKey step or drag tick) writes `advanced.temperature` to storage; subsequent translates use the new value.
- Step 4 (click ResetField): temperature reverts to the schema default; storage writes the default.

## Visible affordances

- Slider uses the project's Slider primitive with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`.
- A ResetField arrow icon sits next to the slider; shows only when value differs from default.
- Numeric readout is a small mono pill beside the label.

## Failure-mode expectations

- Values below 0 or above 2 are clamped to the slider boundary; no out-of-range write.
- Storage write failure surfaces an inline error toast; slider snaps back to last persisted value.

## Cautions

- Storage writes on every value change (each ArrowKey step or drag tick), not only on release.
- Every task sends the global temperature; there is no per-task temperature override.
