# Options-advanced surface rubric

## Mount + render

- Advanced tab contains three sub-tabs in order: Diagnostics (default), Data, Labs.
- Active sub-tab persists in sessionStorage for the duration of the Options tab.
- A sub-tab with settings changed from the default shows a soft "N changed" pill; the word is visible, not only in a hover title.

## Data pane

- Hosts Backup & restore (export/import), the Site overrides list, and "Reset prompt and generation settings" (the Translate prompt, Effort, temperature, max answer length and site overrides; the card names the tab each lives on).
- Destructive operations ask in a danger confirm dialog; Reset to defaults and exporting with API keys also require typing RESET / EXPORT KEYS. Cancel leaves storage untouched.

## Labs pane

- Hosts experimental settings, currently the backend status memory (probe TTL) slider. Its card is titled "Backend status memory"; "Labs" appears only as the sub-tab name, and the card says the setting is experimental.
- Labs settings write directly to `advanced.*` keys in storage via `updateSettings`.

## Safety

- No operation in Advanced silently overwrites or deletes user data without a confirm or type-to-confirm step.
