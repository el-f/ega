# Tooltip-sidepanel-escalation tooltip-escalation-preserves-lang rubric

## Latency budgets

- N/A — this is a payload contract.

## State expectations

- Step 1: tooltip resolves source language X before the request (the default source, or local detection when it is 'auto').
- Step 2: escalation to sidepanel via any path (Continue-in-sidepanel, Pin, Open-in-sidepanel).
- Step 3: the handoff carries X as `sourceLang` and the panel sets its source picker to X; X stays 'auto' when local detection found nothing.

## Visible affordances

- The composer's mode chip names X after the handoff ("Translate · X → Y"), and the "Next message" popover's From shows X; the message itself has no language label.

## Failure-mode expectations

- A tooltip whose source stayed 'auto' -> the handoff carries 'auto' and the panel's source picker is set to 'auto'.

## Cautions

- The detected lang flows via the handoff payload; do not re-detect on the sidepanel side.
- Re-detect on the sidepanel side would be a perf regression AND could yield a different result.
