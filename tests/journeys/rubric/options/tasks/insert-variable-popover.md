# Options-tasks insert-variable-popover rubric

## Latency budgets

- Button click -> list open with the search field focused: <= 150ms.
- Typing -> list filtered: <= 50ms per key.

## State expectations

- Step 1: the user presses "Insert variable" next to the prompt tabs.
- Step 2: a list opens under it with a search field; typing matches the plain name, the token and the meaning.
- Step 3: picking a row inserts its token at the caret and closes the list; Esc closes only the list and returns focus to the button.

## Visible affordances

- Each row: the plain name (600), the `{{token}}` in monospace at the end, a check when the prompt already uses it, and the meaning on a second line. Nothing is cut off and nothing is hover-only.
- Groups: "Variables", then "Empty in this prompt" with the reason as the second line ("Filled only for Explain"); those rows do not insert.
- While more rows sit below, a fade at the bottom edge says so.

## Failure-mode expectations

- A query with no match shows "No variable matches".

## Cautions

- Esc inside the list must not close the dialog under it.
