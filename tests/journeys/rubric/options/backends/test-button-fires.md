# Options-backends test-button-fires rubric

## Latency budgets

- Test-now click -> spinner visible: <= 200ms.
- Probe completes -> latency badge + result text visible: <= 10s (network-dependent; show spinner while pending).

## State expectations

- Step 1: user expands a cloud backend card that has an API key configured; "Test now" button is enabled.
- Step 2 (click Test now): the button reads "Testing…" and disables; Ega re-checks availability, then sends one fixed test translation to the provider.
- Step 3 (success): a latency badge and the translated test phrase appear in the card footer; the button reads "Tested ✓".
- Step 3 (failure): the error message shows as plain result text next to the latency badge.

## Visible affordances

- "Test now" button label changes to "Testing…" during the test and to "Tested ✓" after a success.
- Latency badge tone: green under 500ms, neutral 500-2000ms, amber (warning) over 2000ms.
- Error label is inline inside the card; it does not push other cards out of view.

## Failure-mode expectations

- A test that runs past translateTimeoutMs (default 60s) aborts, and the error shows as result text in the card.
- No API key configured -> "Test now" is disabled with a tooltip explaining a key is required.

## Cautions

- The test is a separate request; it writes a 'backend-test' audit log entry but never touches the translation cache.
- The test result is not stored; it survives collapsing the card and clears on page reload.
