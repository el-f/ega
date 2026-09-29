# Options-backends api-key-show-hide rubric

## Latency budgets

- Eye icon click -> input type flip: <= 1 frame.

## State expectations

- Step 1: cloud provider card is expanded; API key field is `type="password"` (masked).
- Step 2 (click Eye icon): field switches to `type="text"`; key value is readable.
- Step 3 (click EyeOff icon): field reverts to `type="password"`; key is masked again.

## Visible affordances

- Eye / EyeOff icon toggle sits at the right edge of the key input field.
- Icon carries `aria-label="Show API key"` / `aria-label="Hide API key"`.
- The field does NOT auto-hide on blur; the user controls visibility explicitly.

## Failure-mode expectations

- There is no failure mode — show/hide is a local DOM attribute toggle with no storage interaction.

## Cautions

- Reveal is per-card and per-session; it never persists across page reloads.
- The key value must NEVER appear in console logs, request logs, or audit entries regardless of reveal state.
- On card collapse the reveal state resets to masked — the user must click Eye again after re-expanding.
