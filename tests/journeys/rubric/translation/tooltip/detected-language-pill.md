# Tooltip detected-language-pill rubric

## Latency budgets

- Pill render after stream completion: <= 100ms; it lands with the body, not after it.

## State expectations

- Step 1: the backend answer names one language (`detectedLang`) and a detail (`detectedDetail`).
- Step 2: the meta row under the actions shows one `.lang` pill: the preset label, a dash, then the detail ("Arabizi — Levantine").
- Step 3: no multi-variety cluster renders; the single pill covers the one-language case.

## Visible affordances

- The pill's native title repeats the full label, so a long detail stays readable when it wraps.
- The direction label, when shown, is a separate `.lang` element and is not this pill.

## Failure-mode expectations

- An answer with no detected fields shows no pill at all, not an empty one.
- A detail that only repeats the language name is dropped, so the pill never reads "Arabizi — Arabizi".

## Cautions

- An id the preset table does not know shows verbatim; `other` shows the detail alone.
