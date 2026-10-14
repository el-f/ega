# Options-backends prewarm-native-toggle rubric

## Latency budgets

- Checkbox toggle -> storage write: <= 200ms round-trip via chrome.runtime.sendMessage.

## State expectations

- Step 1: user is on the Backends tab and opens the Native host card; the toggle sits at the bottom of that card.
- Step 2 (uncheck the toggle): `settings.preWarmNative` writes `false` to storage.
- Step 3 (re-check): `settings.preWarmNative` writes `true`; subsequent SW boots fire the `warm-session` frame to the native host.
- Default value when the row first paints is `true` (schema default).

## Visible affordances

- A standard HTML checkbox with the label "Start the native host with Chrome".
- One muted line under the label: "Faster first answer, uses some battery". It is the same text the settings search shows.
- Wrapper carries `data-testid="prewarm-native-toggle"`; the checkbox itself carries `data-ega-setting="backends.preWarmNative"`.

## Failure-mode expectations

- Storage write failure (e.g. quota): inline error toast surfaces; the previous checked-state is retained on the UI side.
- A user with no native backend in their chain still sees the toggle (the gate lives in `resolvePreWarmProvider` on the SW side, not in the UI).

## Cautions

- The toggle MUST NOT trigger an immediate warm-session dispatch. Pre-warm fires only on SW boot to keep the cost predictable.
- The toggle MUST NOT block on the storage write — the checkbox flips at once; the options page writes storage directly, with no SW round trip.
