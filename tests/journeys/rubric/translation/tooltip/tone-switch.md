# Tooltip tone-switch rubric

## Latency budgets

- Tone pill click -> picker open: <= 100ms.
- Tone change -> new translation streams in: standard warm/cold latency budgets.

## State expectations

- Step 1: tooltip shows the active tone in the topbar pill (formal / casual / literal / etc).
- Step 2 (click pill -> select a different tone): picker dismisses; the new tone is reflected in the pill.
- Step 3: the translation re-runs with the new tone; the previous result is replaced in place.

## Visible affordances

- The tone pill carries a `combobox` role and current value in `aria-label`.
- Options list is keyboard-navigable (up/down/Enter).

## Failure-mode expectations

- A tone the active backend does not support should be greyed out with a tooltip explaining why, not silently swallowed.

## Cautions

- Tone selection must persist across re-opens of the SAME tooltip in a session. Don't reset to "formal" on every selection.
- The audit log entry records the chosen tone so the user can trace why a translation looks different.
