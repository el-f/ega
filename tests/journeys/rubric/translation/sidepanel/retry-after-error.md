# Sidepanel retry-after-error rubric

## Latency budgets

- Error visible: <= 5s after the send.
- "Try again" click -> new request fired: <= 100ms.

## State expectations

- Step 1: the reply shows an error from the shared catalog (a short title and one plain sentence, not raw HTTP).
- Step 2 (Try again on that reply): the error is replaced by the skeleton and "Translating…"; the reply stays in place (no new message is appended).
- Step 3: on success, the reply fills with the new answer. The message above is unchanged.

## Visible affordances

- "Try again" sits on the failed reply, in its error row, not floating elsewhere.
- After a second failure on the same reply, "Open settings" joins "Try again".

## Failure-mode expectations

- Once a retry also fails, the reply offers a way to fix the cause (Settings), not just an identical retry.
- The user's message stays reachable to copy or edit after any number of failures.

## Cautions

- "Try again" must NOT append a new message. That was an old bug — guard against regression.
- "Try again" must NOT drop the task, tone or target language the message went out with.
