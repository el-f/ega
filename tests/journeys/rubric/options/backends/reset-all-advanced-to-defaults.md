# Options-backends reset-all-advanced-to-defaults rubric

## Latency budgets

- Correct phrase typed -> Reset button enables: <= 1 frame.
- Confirm -> storage reset + toast: <= 600ms.

## State expectations

- Step 1: user clicks "Reset to defaults" in the "Reset prompt and generation settings" card of Advanced > Data; a type-to-confirm "Reset prompt and generation settings" dialog appears.
- Step 2: user types the exact phrase "RESET".
- Step 3: Reset button enables; user clicks it; the prompt template, Effort, temperature, max answer length and site overrides revert to defaults; a toast confirms.

## Visible affordances

- Type-to-confirm input shows the required phrase as placeholder/label.
- Reset button stays disabled until the exact phrase matches (case-sensitive).
- Confirmation toast uses the success tone tokens with the message "Defaults restored".

## Failure-mode expectations

- Partial or wrong phrase -> Reset stays disabled; no write.
- Storage write failure shows a "Change not saved" warning toast; settings may be partially reset.

## Cautions

- This operation is irreversible from the UI perspective. The type-to-confirm guard is non-negotiable.
- API keys and per-language prompt overrides are not affected.
- Cancel at the dialog leaves all settings untouched.
