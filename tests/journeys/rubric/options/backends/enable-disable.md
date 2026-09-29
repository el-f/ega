# Options-backends enable-disable rubric

## Latency budgets

- Toggle click -> storage write: <= 100ms.

## State expectations

- Step 1: user clicks the enable toggle on a backend card.
- Step 2: the provider id is added to / removed from `disabledBackends`.
- Step 3: the card's visual state (saturation / accent) reflects the new state.

## Visible affordances

- Toggle uses the project's switch primitive; tone tokens match enabled / disabled state.
- A disabled backend card carries a "Disabled" badge near the title.

## Failure-mode expectations

- Disabling the active backend (head of chain) surfaces a warning toast naming what will be the new head.
- Disabling the LAST configured backend surfaces a warning ("No backend will be available").

## Cautions

- Disabling a backend mid-stream does NOT cancel the in-flight request — the running stream finishes; the next request honors the new state.
- The backend chain's effective head must update within the next request — settings-runtime-propagation contract.
