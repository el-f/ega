# Options-advanced surface rubric

## Mount + render

- Advanced tab contains three sub-tabs in order: Diagnostics (default), Data, Labs.
- Active sub-tab persists in sessionStorage for the duration of the Options tab.

## Data pane

- Hosts Backup & restore (export/import), the Site overrides list, and "Reset Advanced settings" (template, Effort, temperature, max answer length, site overrides only).
- Destructive operations ask in a danger confirm dialog; Reset Advanced settings and exporting with API keys also require typing RESET / EXPORT KEYS. Cancel leaves storage untouched.

## Labs pane

- Hosts experimental settings, currently the backend status memory (probe TTL) slider.
- Labs settings write directly to `advanced.*` keys in storage via `updateSettings`.

## Safety

- No operation in Advanced silently overwrites or deletes user data without a confirm or type-to-confirm step.
