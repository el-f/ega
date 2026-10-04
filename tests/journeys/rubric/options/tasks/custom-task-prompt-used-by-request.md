# Options-tasks custom-task-prompt-used-by-request rubric

## Latency budgets

- Send click -> backend request: <= 1s with the mock backend.

## State expectations

- Step 1: the user picks the custom task chip, types text and clicks the send button named after the task.
- Step 2: the request's system text holds the task's instructions and the plain contract line.
- Step 3: the answer renders in the conversation.

## Visible affordances

- The send button reads the task's name.

## Failure-mode expectations

- A backend error shows in the turn like any other task.

## Cautions

- "Answer with notes" would add the card contract and may show a notes box headed "Notes".
