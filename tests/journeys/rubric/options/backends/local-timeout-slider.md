# Options-backends local-timeout-slider rubric

## Latency budgets

- ArrowRight on slider -> readout update: <= 1 frame.
- Slider commit (blur / pointer-up) -> storage write: <= 300ms.

## State expectations

- Step 1: user is on the Backends tab; the local-backend timeout slider is visible in the local settings section.
- Step 2 (ArrowRight): slider value increments by one step; the numeric readout updates immediately.
- Step 3 (commit): `localBackendTimeoutMs` persists to storage; subsequent local-backend requests use the new timeout.

## Visible affordances

- Slider uses the project's Slider primitive with `aria-valuemin/max/now` and a unit label ("ms" or "s").
- A ResetField control sits adjacent; visible when value differs from default.

## Failure-mode expectations

- Values below or above the slider bounds are clamped; no out-of-range write.
- Storage write failure surfaces an inline error toast; slider reverts to last persisted value.

## Cautions

- Storage write happens on commit, not on every ArrowKey event.
- Timeout change takes effect on the next local-backend request; in-flight requests are not canceled.
- This slider applies to ALL local backends (native CLI, Ollama); it is not per-provider.
