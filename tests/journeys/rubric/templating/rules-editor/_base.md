# Rules-editor surface rubric

## Mount + render

- Rules list renders one row per rule with category badge + body text + enable toggle + delete control.
- Empty state surfaces a "Pick a recipe" CTA + a manual-add link.

## Add / edit / delete

- Manual add commits via primary action; the new rule appears at the bottom of the list.
- Click-to-edit body persists trimmed text on blur or Enter.
- Toggle commits on click; no separate save step.
- Delete confirms; deletion surfaces an Undo toast.

## Advanced disclosure

- Advanced disclosure (closed by default) houses the manual form + the row editor.
