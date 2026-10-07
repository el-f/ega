# Options-advanced diagnostics-tools-reset rubric

## Latency budgets

- SectionReset click -> storage write + knob revert: <= 200ms.

## State expectations

- Step 1: user changes a setting in the Diagnostics settings card (e.g. Log detail) from its default.
- Step 2: SectionReset button appears in the Diagnostics settings card header.
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
- Log detail is a select labelled "Log detail" with Off, Errors, Warnings (default), Info and Everything; it has no per-field reset.
