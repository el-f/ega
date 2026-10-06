# Options-tasks palette-renders rubric

## Latency budgets

- Insert variable click -> rows visible: <= 150ms.

## State expectations

- Step 1: in the Translate dialog, the user opens Insert variable.
- Step 2: every variable the Translate prompt fills is listed: 10 rows, no answer-format slot.
- Step 3: the "Selected text" row shows `{{text}}` and "The text you selected; the message must contain it".

## Visible affordances

- Plain names and meanings in the list itself, never in a hover tooltip.

## Failure-mode expectations

- Every prompt lists at least the shared variables; there is no empty list.

## Cautions

- A task prompt lists 8 variables and the 2 it cannot fill under "Empty in this prompt".
