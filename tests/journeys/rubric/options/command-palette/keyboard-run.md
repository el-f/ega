# Options command-palette keyboard-run rubric

## Latency budgets

- Ctrl+K keypress -> palette open with the query field focused: <= 150ms.
- Keystroke -> ranked list update: <= 50ms.

## State expectations

- Step 1: user is anywhere inside the Options shell, including a text field (Ctrl+K wins there).
- Step 2 (press Ctrl+K): the palette dialog opens with focus in the query field and the first command selected.
- Step 3 (type): the list narrows to ranked matches under the Actions and Settings headings; the selection goes back to the first row.
- Step 4 (ArrowDown / ArrowUp): the selection moves and wraps; focus stays in the query field.
- Step 5 (Enter): the selected command runs and the palette closes.

## Visible affordances

- The selected row is highlighted; the input's `aria-activedescendant` names it.
- A hint under the list says how to see the keyboard shortcuts.

## Failure-mode expectations

- Zero matches shows "No matches." instead of an empty box.
- Home, End, Shift+Home and Shift+End move the caret in the query field; they do NOT move the selection.

## Cautions

- Ctrl+J/K/N/P inside the open palette must NOT move the selection.
- Esc closes the palette without running anything.
