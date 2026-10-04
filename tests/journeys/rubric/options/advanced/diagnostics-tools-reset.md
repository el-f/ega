# Options-advanced diagnostics-tools-reset rubric

## Latency budgets

- SectionReset click -> storage write + knob revert: <= 200ms.

## State expectations

- Step 1: user changes a diagnostic setting (e.g. debug log level) from its default.
- Step 2: SectionReset button appears in the diagnostics section.
- Step 3 (click SectionReset): all modified diagnostic knobs revert to DEFAULT_SETTINGS values; the SectionReset button hides.

## Visible affordances

- SectionReset is a small muted pill button in the card header with a rotate icon and "Reset section" text.
- Button is hidden when all diagnostic knobs are at default; appears as soon as any knob differs.
- Each knob shows the current value; after reset, values reflect DEFAULT_SETTINGS.

## Failure-mode expectations

- Storage write failure shows a "Change not saved: …" warning toast; the Select control keeps the unsaved value in local state, so a UI/storage mismatch can happen.
- SectionReset only touches the diagnostic section knobs — no other settings are affected.

## Cautions

- SectionReset does NOT reset the entire Advanced tab, only the diagnostics section.
- The log level control uses a select or radio group, not a free-text field.
