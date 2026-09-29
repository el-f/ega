# Slot-palette required-missing-flag rubric

## Latency budgets

- Body edit (removing a required slot) -> chip flag update: <= 200ms.

## State expectations

- Step 1: user's template body contains all required slots; chips render without warning.
- Step 2: user deletes a required slot from the textarea.
- Step 3: the corresponding chip in the palette gains a warning marker ("Missing").

## Visible affordances

- The warning marker uses the warning tone tokens with a clear icon.
- Hover surfaces a tooltip explaining why the slot is required.

## Failure-mode expectations

- Required-slot violations do NOT block Save — the user might intentionally remove a slot. Save logs the warning but proceeds.

## Cautions

- The detection runs on each edit; debounced to avoid per-keystroke flicker.
- A chip without a required marker must NEVER flag missing — only required slots participate in this state.
