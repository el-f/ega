# Tooltip confidence-pill-shown rubric

## Latency budgets

- Pill render after stream completion: <= 100ms.

## State expectations

- Step 1: backend response carries a `confidence` value >= threshold (default 0.6).
- Step 2: pill renders in the tooltip topbar with the success / warning / danger tone that matches the value.
- Step 3: hover surfaces a tooltip with the numeric value + variety detected (where applicable).

## Visible affordances

- Pill color uses the design tokens (success >=0.8, warning 0.6-0.79, danger <0.6 mapped within `multi-variety-cluster`).
- Pill is keyboard-focusable; focus surfaces the same hover detail.

## Failure-mode expectations

- A response with `confidence === null` or undefined falls through to `confidence-pill-hidden` — never renders an empty pill.

## Cautions

- Light + dark contrast: both themes must clear 4.5:1 for pill text against pill background.
- Pill must not occupy more than one row in the topbar; long variety labels truncate with `text-overflow: ellipsis`.
