# Tooltip confidence-pill-shown rubric

## Latency budgets

- Pill render after stream completion: <= 100ms.

## State expectations

- Step 1: backend response carries a `confidence` value > 0 and >= threshold (default 0, so any confidence shows).
- Step 2: pill renders in the meta pills at the end of the action row with the success / warning / danger tone that matches the value.
- Step 3: the pill reads "N% confident" (e.g. "93% confident"); the detected variety is a separate label beside it.

## Visible affordances

- Pill color uses the design tokens: success >=0.8 (`hi`), warning 0.6-0.79 (`mid`), danger <0.6 (`lo`).
- Pill is not focusable; screen readers get `aria-label="N% confident in this translation"`.

## Failure-mode expectations

- A response with `confidence === null` or undefined falls through to `confidence-pill-hidden` — never renders an empty pill.

## Cautions

- Light + dark contrast: both themes must clear 4.5:1 for pill text against pill background.
- Long variety labels in the meta pills wrap inside themselves (`overflow-wrap: anywhere`) instead of pushing past the tooltip edge.
