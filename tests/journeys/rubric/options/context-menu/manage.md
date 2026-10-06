# Options right-click menu manage rubric

## Mount + render

- The Selection & picker tab renders ONE "Right-click menu" card after "Element picker & shortcut": a title with an (i) button, one line "What Ega adds when you right-click a web page", then three groups.
- The groups are "Selected text", "Images" and "Page", in that order. Each is one tinted box drawn like the menu Chrome shows: the first line reads "Ega ▸", or "Nothing from Ega shows here" when no row in the group shows.
- A row is a drag grip, a checkbox, a kind icon, the name, then "Move up", "Move down" and "Edit". The site toggle row has no checkbox and no Edit; its line says it shows "Enable Ega on this site" on sites where Ega is off.
- Names are automatic ("Translate", "Translate in side panel", "Translate image in side panel", "Translate this page"); no name ends in "with Ega". There is no Layout (Nested/Flat) control.

## State expectations

- The checkbox writes `contextMenuItems[].enabled` at once. Edit opens one row's options under it (Task, Opens in, Answer in for text rows, Name in menu); only one row is open at a time and Esc closes it with focus back on Edit.
- Move up and Move down reorder only inside the group. Focus stays on the pressed button of the moved row, and a status line says "{name} moved to position {k} of {n}".
- "Add text action" and "Add image action" sit under their own group. A new row opens its options with focus on Task.
- Reset section restores the 7 shipped rows and removes added rows; a toast "Right-click menu reset." offers Undo for 8 s, and focus moves to the first checkbox.

## Visible affordances

- Shipped rows can be hidden but never deleted; Delete appears only in the options of a row the user added, and its toast offers Undo.
- A hidden row reads "Hidden" in secondary text. A row whose task is off reads "Hidden: {Task} is off in Tasks"; the picker row reads "Hidden: the element picker is off" while the picker is off.
- At the end of a group the arrow stays in place, dimmed, and its name says "already first" or "already last".

## Failure-mode expectations

- An empty "Name in menu" is valid and means the automatic name; there is no error state.
- A save failure shows the existing "Change not saved" toast and the card re-renders from storage.

## Cautions

- Order is per group: Chrome draws three separate menus, so a row never moves into another group.
- The image rows own where they open; the Display surface card has no image select.
