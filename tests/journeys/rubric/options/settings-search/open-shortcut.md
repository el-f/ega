# Options-settings-search open-shortcut rubric

## Latency budgets

- Ctrl+, keypress -> modal open: <= 150ms.

## State expectations

- Step 1: user is anywhere inside the Options shell.
- Step 2 (press Ctrl+,): the settings-search modal mounts with the input field focused.
- Step 3: typing begins narrowing the result list immediately.

## Visible affordances

- The modal carries `aria-modal="true"`; focus is trapped while open.
- The shortcut is shown on the header "Search settings" button (kbd + tooltip) and in the ? shortcuts overlay.

## Failure-mode expectations

- The shortcut must NOT fire inside text inputs across the rest of Options where Ctrl+, has no usage — but it MUST fire when the focus is on a button / rail / non-text-input element.

## Cautions

- The shortcut must NOT conflict with Chrome's own (Ctrl+, opens Chrome's settings on macOS; this is an Options-internal handler, not a global one).
- The modal must be the only thing focusable while open.
