# Popup-sidepanel-handoff handoff-then-task-switch rubric

## Latency budgets

- Task-switch select change -> task header updates in composer: <= 100ms.

## State expectations

- Step 1: popup handoff carries `task=translate`; sidepanel seeds the turn using translate template.
- Step 2: after the seeded turn completes, user changes the task picker in the sidepanel composer to `reword`.
- Step 3: user types a new message and sends; the outbound request carries the `reword` template — NOT the handoff's original `translate` template.

## Visible affordances

- The composer task picker reflects the switched task immediately.
- The seeded turn header still shows `translate` (historical label unchanged).

## Failure-mode expectations

- Task switch during an active stream has no effect on the current stream; it takes effect on the next send.

## Cautions

- The handoff payload's task field sets the initial task for the seeded turn only. After the seed is consumed, the active task is the sidepanel's own current selection.
- Switching task must not re-fire the seeded turn; it only affects the NEXT user-initiated send.
