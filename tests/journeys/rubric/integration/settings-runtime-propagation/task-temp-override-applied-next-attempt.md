# Settings-runtime-propagation task-temp-override-applied-next-attempt rubric

## Latency budgets

- Slider commit -> storage write: <= 200ms.
- Next attempt request body carries new temperature: <= 300ms after commit.

## State expectations

- Step 1: a translate is in flight under `taskTemperatures.translate = 0.7`.
- Step 2 (user moves the translate-temperature slider to 0.3 mid-stream): the in-flight request finishes at 0.7.
- Step 3: the NEXT translate request body shows `temperature: 0.3`.

## Visible affordances

- The slider value is shown as a readout pill; commits on release.

## Failure-mode expectations

- A slider commit during the active stream does not retroactively alter the stream's temperature — caches that bind to the old digest still hit if all other inputs match.

## Cautions

- The per-task temperature is composed into the cache digest (per 0.22.1 fix); the new value invalidates cache for subsequent identical inputs.
- `buildBackendConfig` is the resolution point; the resolved temperature flows into the request, not the raw setting.
