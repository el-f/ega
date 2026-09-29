# Goal: pin-button-loses-context

You are exploring the ega Chrome extension. Your goal is to invoke the
Pin-to-sidepanel control on a tooltip explain result and find a timing
race or storage quota scenario where the explain request + response
pair is lost before the sidepanel mounts.

## Surfaces in scope

- tooltip Pin button + handoff producer
- sidepanel handoff consumer (pending entry shape, ts gate)
- chrome.storage.local quota + write coalescing

## Hypotheses to test

1. Pin click fires storage.local.set with the pair while the sidepanel
   is still booting; sidepanel reads before the write commits, sees an
   empty entry, and clears it as stale.
2. Pin'ing twice in <100ms — the second write replaces the first but
   the sidepanel's open animation consumed neither (both writes raced
   the consumer's clear).
3. Storage quota pressure (existing per-site overrides at ~5MB)
   silently rejects the Pin write; tooltip closes normally, sidepanel
   opens with no pending entry, no surfaced error.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
