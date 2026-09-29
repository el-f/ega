# Options-translate surface rubric

## Mount + render

- Translate tab renders: default language pair, default task selector, generation tuning section, and cache toggle.
- Each knob writes to storage via `updateSettings`; no batch-submit required.

## Generation tuning

- Global temperature slider persists `advanced.temperature`; per-task fields override per task key.
- A ResetField control per row reverts that field to its schema default.
- SectionReset at the bottom of the generation block clears all per-task overrides at once.

## Cache

- cacheEnabled toggle persists immediately; no restart required.

## A11y

- All form controls have associated labels; sliders carry `aria-valuemin/max/now`.
