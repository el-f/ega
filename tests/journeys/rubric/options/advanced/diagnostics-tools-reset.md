# Options-advanced diagnostics-tools-reset rubric

## Latency budgets

- SectionReset click -> storage write + knob revert: <= 200ms.

## State expectations

- Step 1: user changes a diagnostic setting (e.g. debug log level) from its default.
- Step 2: SectionReset button appears in the diagnostics section.
- Step 3 (click SectionReset): all modified diagnostic knobs revert to DEFAULT_SETTINGS values; the SectionReset button hides.

## Visible affordances

- SectionReset uses a secondary danger-tone button with a reset icon.
- Button is hidden when all diagnostic knobs are at default; appears as soon as any knob differs.
- Each knob shows the current value; after reset, values reflect DEFAULT_SETTINGS.

## Failure-mode expectations

- Storage write failure surfaces an inline error toast; knob values revert to stored values (no UI/storage mismatch).
- SectionReset only touches the diagnostic section knobs — no other settings are affected.

## Cautions

- SectionReset does NOT reset the entire Advanced tab, only the diagnostics section.
- The log level control uses a select or radio group, not a free-text field.
