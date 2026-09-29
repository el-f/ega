# Goal: quota-pressure-storage

You are exploring the ega Chrome extension. Your goal is to push
chrome.storage.local toward quota and verify the extension degrades
predictably (no data loss, no silent overwrites, no infinite-write loop).

## Surfaces in scope

- background settings persistence
- audit log rolling-50 cap
- per-site overrides + variety overrides

## Hypotheses to test

1. Writing a 4MB blob into a custom-language body, saving, then editing a
   sibling setting truncates the body silently on the next save.
2. The audit log rolling cap isn't enforced when entries are appended in
   rapid succession from concurrent translates.
3. quota-exceeded errors propagate to the UI but don't roll back partial
   writes (settings.X persists, settings.Y is lost).

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
