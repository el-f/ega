# Tooltip confidence-pill-hidden rubric

## Latency budgets

- N/A — this is a non-render contract.

## State expectations

- Step 1: backend response carries `confidence < threshold` OR `confidence` is undefined / null.
- Step 2: pill is NOT rendered; the meta row under the actions shows only the detected-language / direction labels, if any.
- Step 3: no layout placeholder remains where the pill would be; with no other meta the meta row is not rendered.

## Visible affordances

- N/A — the affordance is the absence.

## Failure-mode expectations

- A bug that renders an empty pill (no value) is treated as the same severity as a missing pill — both are inconsistent.

## Cautions

- The pill threshold is configurable via `confidencePillThreshold` setting; the gate reads the live value (no stale closure).
- Threshold of 0 means "always show"; threshold of 1 means "effectively never" — both edges must work.
