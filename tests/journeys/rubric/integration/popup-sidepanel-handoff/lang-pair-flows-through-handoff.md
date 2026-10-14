# Popup-sidepanel-handoff lang-pair-flows-through-handoff rubric

## Latency budgets

- N/A — this is a payload contract.

## State expectations

- Step 1: popup has user-picked source + target language (or auto + default).
- Step 2 (Send-to-panel): the lang pair is included in the handoff payload as flat `sourceLang` and `targetLang` fields.
- Step 3: sidepanel reads the payload; the first UserTurn carries the lang pair; the request body uses it.

## Visible affordances

- The sidepanel's source/target pickers switch to the popup's pair; the seeded UserTurn shows only its task badge.

## Failure-mode expectations

- A payload missing `sourceLang` or `targetLang` is dropped on read; no turn is seeded.

## Cautions

- The lang pair MUST be the flat string fields `sourceLang` and `targetLang` — flow tests assert this shape.
- The popup must NOT serialize the lang-pair as a stringified composite ("en-fr") — keep it structured.
