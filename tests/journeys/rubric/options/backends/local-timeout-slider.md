# Options-backends local-timeout-slider rubric

## Latency budgets

- ArrowRight on slider -> readout update: <= 1 frame.
- Slider commit (blur / pointer-up) -> storage write: <= 300ms.

## State expectations

- Step 1: user is on the Backends tab; the local-backend timeout slider is visible in the local settings section.
- Step 2 (ArrowRight): slider value increments by one step; the numeric readout updates immediately.
- Step 3 (commit): `localBackendTimeoutMs` persists to storage; later Ollama reachability checks and the router's native check use the new timeout, but the Options page's own native checks always allow at least 5 s, so the slider does not change them.

## Visible affordances

- Slider uses the project's Slider primitive with `aria-valuemin/max/now` and a unit label ("ms" or "s").
- The readout is in seconds with one decimal ("0.8 s"); storage keeps whole milliseconds. The slider sits in a standard SectionCard titled "Local-backend checks".
- No reset control sits next to this slider; only the live seconds readout does.

## Failure-mode expectations

- Values below or above the slider bounds are clamped; no out-of-range write.
- Storage write failure surfaces an inline error toast; slider reverts to last persisted value.

## Cautions

- Storage write happens on commit, not on every ArrowKey event.
- Timeout change takes effect on the next reachability check (the local cards re-check at once); it does not bound translate requests.
- This slider applies to ALL local backends (native CLI, Ollama); it is not per-provider.
