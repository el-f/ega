# Options-backends test-button-fires rubric

## Latency budgets

- Click -> "Testing..." on the button: immediate.
- Probe completes -> result visible: <= 10s (network-dependent).

## State expectations

- Step 1: the Anthropic row is open; "Test now" is a secondary button.
- Step 2: the button reads "Testing..." while it runs.
- Step 3 (pass): "Answered in <time>" and the test answer show under the button; the status pill reads "Verified" and still does after a reload.
- Step 3 (fail): a short title in the error colour and one plain sentence; the backend's message and the error code only under "Details".

## Visible affordances

- No colour-only latency tiers and no "Tested ✓" label; the pill says Verified.

## Failure-mode expectations

- A test whose settings changed while it ran says "The settings changed while the test ran. Test again." and proves nothing.
