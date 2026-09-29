# Options-shell tab-switch rubric

## Latency budgets

- Tab click -> panel swap: <= 200ms.
- `aria-selected` update on click: <= 1 frame.

## State expectations

- Step 1: user is on tab A.
- Step 2 (click tab B): the previous panel unmounts; tab B's panel mounts.
- Step 3: `aria-selected` flips on the clicked tab; the active tab's accent token applies.

## Visible affordances

- Tab swap uses a subtle fade transition; under 200ms motion budget.
- Focus moves to the panel content area after switch.

## Failure-mode expectations

- A tab swap mid-edit (unsaved draft in another tab's form) surfaces a confirm dialog before unmounting.

## Cautions

- Only ONE panel is mounted at a time — preserve memory budgets.
- Tab switch must NOT trigger a storage write — it's a navigation, not a settings change.
