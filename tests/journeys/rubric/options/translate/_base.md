# Options-translate surface rubric

## Mount + render

- The Answers tab (id translate) renders, with no group labels: "Where answers show", "Page context", "Generation", "Streaming and cache", "Routing & timeouts" (until it moves to Backends) and "Page translate". Default languages are on the Languages tab; default task and tone on the Tasks tab; the right-click menu on the Selection and picker tab.
- When the model cannot take temperature or answer length, the slider stays, disabled, with the reason under it; the native-CLI reason is said once.
- Each knob writes to storage on change via `updateSettings`; no batch-submit required.

## Generation tuning

- Global temperature slider persists `advanced.temperature`; every task uses the global temperature and max answer length.
- The Effort control (Off/Low/Medium/High) persists `advanced.effort`. When the level does not run as picked on the backend that answers first (the router's probe decides which), a note under it says what runs instead, or that the model has no effort setting.
- Global sliders show a ResetField that reverts to the schema default.
- The Generation card header has a SectionReset for Effort, temperature and max answer length. There is no per-task overrides card.

## Cache

- cacheEnabled sits in the Streaming and cache card and persists immediately; no restart required.

## A11y

- All form controls have associated labels; sliders carry `aria-valuemin/max/now`.
