# Options-settings-search surface rubric

## Mount + dismiss

- Ctrl+, (Cmd+, on macOS) opens the search modal from anywhere in Options except while focus is in an input (text box or checkbox), textarea or editable field; the header "Search settings" button opens it too.
- Esc dismisses without performing a jump; click-outside also dismisses.

## Query

- Typing narrows the result list against the settings registry (label, id, description, keywords), with a typo fallback for 4+ char queries.
- Each result row shows a tab badge, the full label and the description, with the query substring marked.

## Jump

- Enter on the active result jumps to the target tab AND scroll-anchors the matching row.
- Result list is keyboard-navigable (up / down / Enter).
- While a list shows, a footer line names the keys: ↑↓ move, Enter open, Esc close.

## A11y

- Modal has `aria-modal="true"`, focus is trapped while open, returns to the prior focus on close.
