# Options-backends reset-all-advanced-to-defaults rubric

## Latency budgets

- Correct phrase typed -> Reset button enables: <= 1 frame.
- Confirm -> storage reset + toast: <= 600ms.

## State expectations

- Step 1: user clicks "Reset ALL" in Advanced > Data; a type-to-confirm dialog appears.
- Step 2: user types the exact phrase "RESET".
- Step 3: Reset button enables; user clicks it; all settings (including custom languages, glossary, rules, backend config) revert to DEFAULT_SETTINGS; a toast confirms.

## Visible affordances

- Type-to-confirm input shows the required phrase as placeholder/label.
- Reset button stays disabled until the exact phrase matches (case-sensitive).
- Confirmation toast uses the success tone tokens with a brief message ("Settings reset to defaults").

## Failure-mode expectations

- Partial or wrong phrase -> Reset stays disabled; no write.
- Storage write failure surfaces an inline error; settings may be partially reset — advise user to reload.

## Cautions

- This operation is irreversible from the UI perspective. The type-to-confirm guard is non-negotiable.
- API keys are also cleared; any configured keys must be re-entered after reset.
- Cancel at the dialog leaves all settings untouched.
