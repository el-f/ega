# Tooltip tone-switch rubric

## Latency budgets

- Tone pill click -> picker open: <= 100ms.
- Tone change -> new translation streams in: standard warm/cold latency budgets.

## State expectations

- Step 1: with task Reword, the topbar shows a Tone select with the active tone (Formal / Casual / Neutral / Polite / Blunt).
- Step 2 (pick a different tone in the Tone select): the tooltip reopens with the new tone selected.
- Step 3: the translation re-runs with the new tone; the previous result is replaced in place.

## Visible affordances

- The Tone control is a native `<select>` (implicit combobox role) with aria-label "Tone"; the current value is its selected option.
- Options list is keyboard-navigable (up/down/Enter).

## Failure-mode expectations

- All five tones are always selectable; there is no per-backend disabled state.

## Cautions

- Tone carries across Retry/task/swap reopens of the same request; a new selection starts from `defaultTone` (default "neutral").
- Audit entries carry no tone field (they also store languages, latency, confidence and request id, not just task/backend/model/prompts/response).
