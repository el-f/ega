# Rules-editor surface rubric

## Mount + render

- Rules list renders one editable row per rule: body text with a visible pencil, category select, scope chips, an "On" checkbox and a delete control. No disclosure hides the rows.
- A rule that is off shows an "Off" badge and a dashed border; its text keeps full contrast.
- Empty state shows "No rules yet" with an "Add a rule" button that opens the add form; the form's own "Add a rule" row shows only once rules exist or the form is open.

## Add / edit / delete

- Manual add commits via primary action; the new rule appears at the bottom of the list, scrolls into view and pulses once. The form closes; Cancel closes it and clears it.
- Click-to-edit body persists trimmed text on blur or Ctrl/Cmd+Enter, and shows "Saved".
- Toggle commits on click; no separate save step.
- Delete removes the rule at once and surfaces an Undo toast (no confirm).
