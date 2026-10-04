# Options-advanced labs-probe-ttl-slider rubric

## Latency budgets

- ArrowRight on slider -> storage write: <= 300ms (on commit, not on every key).

## State expectations

- Step 1: user navigates to Advanced > Labs; the probe TTL slider is visible.
- Step 2 (press ArrowRight): slider value increments by one step; readout updates immediately.
- Step 3: each value change writes `advanced.backendProbeTtlMs` (seconds x 1000) to storage right away.

## Visible affordances

- Slider uses the project's Slider primitive with `aria-valuemin/max/now` and a numeric readout beside it.
- The readout shows seconds with an " s" unit (5-300 s, step 5), with help text "Default 30 s."
- No reset button; a modified dot marks the label when the value differs from the 30 s default.

## Failure-mode expectations

- Dragging past min/max clamps to the boundary; no invalid value is written.
- Storage write failure shows a "Change not saved" warning toast.

## Cautions

- Storage write happens on every value change (each ArrowKey step or drag tick); there is no commit-only write.
- The probe TTL only takes effect on the NEXT backend probe cycle; in-flight probes are not canceled.
