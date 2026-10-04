# Goal: desync-popup-sidepanel

You are exploring the ega Chrome extension. Your goal is to force the popup
and sidepanel into inconsistent views of the same underlying state (active
backend, conversation history, settings dirty-flag).

## Surfaces in scope

- popup ActiveBackendChip + lang pair selector
- sidepanel header + composer
- background message bus (settings:changed, translate:start)

## Hypotheses to test

1. Mutating a setting in Options while the popup is mounted leaves a stale
   chip label until the popup is closed and reopened.
2. Switching languages in the popup mid-stream corrupts the sidepanel's
   per-turn lang attribution.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
