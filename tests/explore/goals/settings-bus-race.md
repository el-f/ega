# Goal: settings-bus-race

You are exploring the ega Chrome extension. Your goal is to dispatch
concurrent `patchSettings` calls from popup + options + sidepanel and
verify that the broadcast after each `settings:update` keeps causal ordering
without lost updates.

## Surfaces in scope

- background settings mutator (`patchSettings`, the SW `settings:update` handler)
- chrome.runtime message bus (`settings:update` messages)
- all three surfaces' settings subscribers

## Hypotheses to test

1. Two patches at the same task tick from different surfaces collapse —
   the second write wins entirely, dropping the first's fields even when
   they touch disjoint keys (last-writer-wins on the whole blob).
2. Broadcast ordering does not match write ordering — popup's patch
   commits second but its broadcast arrives first at
   options, leaving options' subscriber with the popup view of state
   for one render frame.
3. The SW `settings:update` handler guards writes but not reads; a subscriber reading
   `getSettings()` mid-patch observes a half-merged shape with one key
   from the old and one from the new write.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
