# Options-advanced surface rubric

## Mount + render

- The header reads "Advanced" with the line "Backups, saved data and diagnostics". Two sub-tabs in order: Data (default), Diagnostics.
- Active sub-tab persists in sessionStorage for the duration of the Options tab.
- A sub-tab with settings changed from the default shows a soft "N changed" pill whose accessible name is "N setting(s) changed from its default".

## Data pane

- Four cards in order: Backup and restore ("Every setting in one file", Include API keys with the hint "Leave this off for a file you share", Export all settings, Import settings...), Site overrides, Saved conversations, Reset and delete.
- Reset and delete has three rows, each a label, one muted line and one button: Reset prompt and model settings (Reset, acts at once with Undo, site overrides untouched), Clear saved answers (Clear cache, acts at once, toast "Saved answers cleared"), Delete all data (the only red fill in Advanced; opens the typed DELETE dialog).
- Removing a site override acts at once with Undo; deleting saved conversations and exporting with API keys still ask first.

## Diagnostics pane

- Four cards: Recent requests (filters, Details, Export and Clear in the header), Response times (labelled stat pairs, Copy data in the header while there is data), Recent errors (plain error titles with a count), Diagnostics settings (Record request details with its hint, and Log detail: Off, Errors, Warnings (default), Info, Everything).

## Safety

- No operation in Advanced overwrites or deletes user data without a confirm, a typed confirm, or an Undo toast.
