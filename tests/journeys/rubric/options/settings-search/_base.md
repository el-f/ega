# Options-settings-search surface rubric

## Mount + dismiss

- Ctrl+, opens the search modal anywhere inside the Options shell.
- Esc dismisses without performing a jump; click-outside also dismisses.

## Query

- Typing narrows the result list against a fuzzy index of settings spec entries (label + description + tab).
- Each result row names the target tab and a fragment of the matched label.

## Jump

- Enter on the active result jumps to the target tab AND scroll-anchors the matching row.
- Result list is keyboard-navigable (up / down / Enter).

## A11y

- Modal has `aria-modal="true"`, focus is trapped while open, returns to the prior focus on close.
