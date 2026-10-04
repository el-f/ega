# Rules-editor surface rubric

## Mount + render

- Rules list renders one row per rule with category badge + body text + enable toggle + delete control.
- Empty state shows "No rules yet" and points to "Add a rule", which is visible below it.

## Add / edit / delete

- Manual add commits via primary action; the new rule appears at the bottom of the list.
- Click-to-edit body persists trimmed text on blur or Ctrl/Cmd+Enter.
- Toggle commits on click; no separate save step.
- Delete confirms; deletion surfaces an Undo toast.

## Advanced disclosure

- Advanced disclosure (closed by default, shown only when rules exist) houses the per-rule row editor; the "Add a rule" form sits above it, outside the disclosure.
