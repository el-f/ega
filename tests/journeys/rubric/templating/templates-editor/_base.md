# Templates-editor surface rubric

## Mount + scope

- Scope chip row mounts on entry; the active scope's body fills the editor textarea.
- Switching chip swaps the editor body without saving the previous draft — explicit Save commits, leaving the editor preserves the draft until navigation.

## Save + reset

- Save persists the active template to `templates[scope]` (or `perPresetTemplates[preset]` for preset overrides).
- Reset removes the override and falls back to the inherited body. The reset button is disabled when no override exists.

## Preview + delegation

- Compiled preview renders the resolved system + user prompt; previews update on body change within 100ms.
- Translate / Explain chip selection surfaces a delegation banner with a jump-to-Global affordance.

## A11y

- Editor textarea carries an accessible name; chip rail uses a proper tablist role.
