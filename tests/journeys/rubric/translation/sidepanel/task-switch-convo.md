# Sidepanel task-switch-convo rubric

## Latency budgets

- Task picker open: <= 100ms.
- New task first token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: sidepanel has an ongoing conversation with task X (translate).
- Step 2 (open task picker + choose task Y): the NEXT user message routes under task Y; prior turns retain their original task labels.
- Step 3: the conversation history still flows into the next request as context, but the new turn's task chip and template selection reflect task Y.

## Visible affordances

- Active task chip updates immediately.
- A subtle marker on the next user turn indicates the task switch happened.

## Failure-mode expectations

- Switching to a task the active backend doesn't support surfaces a tooltip / inline warning before the next send.

## Cautions

- Task switch must NOT alter prior turns. They are immutable.
- The chosen task persists into the audit log for the next turn.
