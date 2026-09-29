# Options-advanced surface rubric

## Mount + render

- Advanced tab contains sub-tabs: Data, Labs (and any other panes added over time).
- Active sub-tab persists in sessionStorage for the duration of the Options tab.

## Data pane

- Hosts backup export/import and reset-all-data controls.
- Destructive operations require type-to-confirm guard; cancel leaves storage untouched.

## Labs pane

- Hosts experimental settings: probe TTL slider, per-task backend chain editor, and similar.
- Labs settings write directly to `advanced.*` keys in storage via `updateSettings`.

## Safety

- No operation in Advanced silently overwrites or deletes user data without a confirm or type-to-confirm step.
