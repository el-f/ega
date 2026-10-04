# Sidepanel task-switch-convo rubric

## Latency budgets

- Task picker open: <= 100ms.
- New task first token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: sidepanel has an ongoing conversation with task X (translate).
- Step 2 (click task Y in the task strip): the Send button reads Y; the NEXT user message routes under task Y; prior turns keep their kind badges.
- Step 3: the conversation history still flows into the next request as context, but the new turn's task chip and template selection reflect task Y.

## Visible affordances

- Active task chip updates immediately.
- Each user turn carries a kind badge (e.g. Translate, Reword), so the next turn shows task Y.

## Failure-mode expectations

- With an image attached, a non-image task sends as "Translate image" and the Send tooltip says "Images support Translate and Explain".

## Cautions

- Task switch must NOT alter prior turns. They are immutable.
- The chosen task persists into the audit log for the next turn.
