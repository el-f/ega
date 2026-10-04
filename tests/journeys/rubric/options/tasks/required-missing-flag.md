# Options-tasks required-missing-flag rubric

## Latency budgets

- Body edit (removing a required slot) -> chip flag update: <= 200ms.

## State expectations

- Step 1: user's template body contains all required slots; chips render without warning.
- Step 2: user deletes a required slot from the textarea.
- Step 3: the corresponding chip gains a danger border and a `required` badge.

## Visible affordances

- The marker uses the danger tone (badge + chip border), with no icon.
- Hover surfaces a tooltip explaining why the slot is required.

## Failure-mode expectations

- A missing required slot blocks Save: an inline alert says the message must contain `{{text}}`, and nothing is written.

## Cautions

- The detection runs on every edit (a derived value, no debounce).
- A chip without a required marker must NEVER flag missing — only required slots participate in this state.
