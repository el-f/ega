# Options-languages surface rubric

## Mount + render

- The tab has three cards: "Default languages" ("Used when you do not pick a language"), "Slang and special languages" ("Shown in the language pickers next to the standard languages", with an (i) and a secondary "Add language" in its header), and "Backup and restore".
- Each language is one row with hairlines between rows: a checkbox named "Show <name> in language pickers" with the name, a "Custom" or "Edited" pill, the example count spelled out ("1 example", "3 examples") and "Edit". No notes text in the row; Export and Delete live in the dialog.
- A filter with a visible search icon, named "Filter languages", sits above the list.
- Edit and Add language open the language dialog; each field saves as it changes and the footer says "Saved".

## Add / delete

- Add language opens "New language"; it is created once it has a name and notes.
- Delete language in the dialog removes it at once; the toast Deleted "<name>" offers Undo.

## Export

- Export languages triggers one download with a dated name; it never changes `customLanguages`.
