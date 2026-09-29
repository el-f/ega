# Options-translate generation-reset-all-pertask rubric

## Latency budgets

- SectionReset click -> storage write + all per-task rows cleared: <= 300ms.

## State expectations

- Step 1: at least two per-task temperature overrides are set (e.g. translate + reword).
- Step 2: the SectionReset button is visible in the generation tuning section.
- Step 3 (click SectionReset): all per-task override keys (`taskTemperatures.*`) are deleted from storage; each per-task row reverts to show the inherited global value.
- Step 4: SectionReset hides because no per-task overrides remain.

## Visible affordances

- SectionReset uses the project's SectionReset primitive with a reset icon and secondary-danger tone.
- Button appears as soon as any per-task override key exists; hides when none remain.

## Failure-mode expectations

- SectionReset ONLY clears per-task overrides; the global temperature slider value is untouched.
- Storage write failure surfaces an inline error; rows retain their current displayed values.

## Cautions

- This action is scoped to generation per-task overrides only — it does not reset other sections (cache, display mode, etc.).
- After SectionReset, the per-task row inputs still render (empty / showing inherited value); they are not hidden.
