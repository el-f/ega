# Options-backends enable-disable rubric

## Latency budgets

- Toggle click -> storage write: <= 100ms.

## State expectations

- Step 1: user clicks the Disable (or Enable) button beside a backend card, or drags it across the divider.
- Step 2: the provider id is added to / removed from `disabledBackends`.
- Step 3: the row moves between the "Backends in use" and "Not in use" cards; the row is not dimmed.

## Visible affordances

- The control is a Button: ghost "Disable" in the active list, secondary "Enable" in the available list.
- A disabled backend gets no "Disabled" badge; it sits under "Not in use" with no position number and no dash.

## Failure-mode expectations

- Disabling the head of the chain shows no toast; a screen-reader note says "<id> disabled" and "First choice" moves to the next row that is ready (a key set, or a local backend that answered).
- Disabling the last enabled backend is blocked; a screen-reader-only note says "At least one backend must stay enabled".

## Cautions

- Disabling a backend mid-stream does NOT cancel the in-flight request — the running stream finishes; the next request honors the new state.
- The backend chain's effective head must update within the next request — settings-runtime-propagation contract.
