# Options-backends test-button-fires rubric

## Latency budgets

- Test-now click -> spinner visible: <= 200ms.
- Probe completes -> latency badge + result text visible: <= 10s (network-dependent; show spinner while pending).

## State expectations

- Step 1: user expands a cloud backend card that has an API key configured; "Test now" button is enabled.
- Step 2 (click Test now): button shows a spinner; a minimal probe request fires to the provider.
- Step 3 (success): a green latency badge and short result text ("OK — 243ms") appear inside the card.
- Step 3 (failure): a red error label with the error message appears inside the card.

## Visible affordances

- "Test now" button uses the project's secondary action tokens; label changes to spinner during probe.
- Latency badge uses the project's tone tokens (green < 500ms, amber 500-2000ms, red > 2000ms).
- Error label is inline inside the card; it does not push other cards out of view.

## Failure-mode expectations

- Probe timeout (>10s) surfaces a timeout error label inside the card.
- No API key configured -> "Test now" is disabled with a tooltip explaining a key is required.

## Cautions

- Test probe is a separate minimal request — it does NOT write to audit log or cache.
- The test result is ephemeral; it clears on card collapse or page reload.
