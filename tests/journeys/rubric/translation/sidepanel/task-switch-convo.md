# Sidepanel task-switch-convo rubric

## Latency budgets

- "Next message" popover open: <= 100ms.
- New task first token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: the side panel has a conversation with task X (Translate).
- Step 2 (mode chip → pick task Y): the chip reads Y ("Reword"); the NEXT message routes under task Y; earlier messages keep their labels.
- Step 3: the conversation history still flows into the next request as context, but the new message's task label ("Reword", shown because the task changed) and template reflect task Y.

## Visible affordances

- The chip updates at once; the picked task carries a check in the picker.
- A message names its task above the bubble only where the task changes.

## Failure-mode expectations

- With an image attached, a task that cannot read images is marked unavailable in the picker, with the note "Images work with Translate and Explain"; the chip reads "Translate image → {Target}".

## Cautions

- A task switch must NOT alter earlier turns. They are immutable.
- The chosen task goes into the audit log for the next turn.
