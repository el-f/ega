# Slot-palette surface rubric

## Mount + render

- Palette lists per-task slots as chips; required slots are visually distinct (asterisk / color token).
- Insert-variable popover surfaces a searchable slot list; opens within 150ms of trigger.

## Required-slot validation

- A required slot deleted from a user template flags the corresponding chip with a warning indicator.
- Missing-required-slot state must NOT silently downgrade — the user template either contains the slot or surfaces the warning.

## Insertion

- Selecting a slot from the popover inserts the `{{slot}}` token at the editor caret position.
- Slot tokens are non-editable spans inside the textarea preview — never broken up by partial editing.
