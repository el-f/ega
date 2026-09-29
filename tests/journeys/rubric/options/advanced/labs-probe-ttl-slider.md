# Options-advanced labs-probe-ttl-slider rubric

## Latency budgets

- ArrowRight on slider -> storage write: <= 300ms (on commit, not on every key).

## State expectations

- Step 1: user navigates to Advanced > Labs; the probe TTL slider is visible.
- Step 2 (press ArrowRight): slider value increments by one step; readout updates immediately.
- Step 3 (blur or commit): `advanced.backendProbeTtlMs` persists the new value to storage.

## Visible affordances

- Slider uses the project's Slider primitive with `aria-valuemin/max/now` and a numeric readout beside it.
- A ConfidencePill or unit label ("ms") clarifies the value scale.
- A ResetField control next to the slider reverts to the schema default.

## Failure-mode expectations

- Dragging past min/max clamps to the boundary; no invalid value is written.
- Storage write failure surfaces an inline error; slider snaps back to last persisted value.

## Cautions

- Storage write happens on commit (blur / pointer-up), not on every ArrowKey event, to avoid flooding storage.
- The probe TTL only takes effect on the NEXT backend probe cycle; in-flight probes are not canceled.
