# Tooltip-sidepanel-escalation tooltip-escalation-preserves-lang rubric

## Latency budgets

- N/A — this is a payload contract.

## State expectations

- Step 1: tooltip detected source language X (e.g., Arabic) during the failed / completed translate.
- Step 2: escalation to sidepanel via any path (Continue-in-sidepanel, Pin, Open-in-sidepanel).
- Step 3: the sidepanel seed turn carries source lang X; the next request body uses X (not "auto").

## Visible affordances

- The seeded UserTurn surfaces the detected lang chip matching what the tooltip showed.

## Failure-mode expectations

- A tooltip with no detected lang (no detection ran, or `source === 'auto'` preserved) -> the sidepanel mounts with the user's persisted default source.

## Cautions

- The detected lang flows via the handoff payload; do not re-detect on the sidepanel side.
- Re-detect on the sidepanel side would be a perf regression AND could yield a different result.
