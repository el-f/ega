# Goal: escape-handoff-staleness-gate

You are exploring the ega Chrome extension. Your goal is to coerce a stale
popup→sidepanel handoff entry past the 60-second staleness gate so that the
sidepanel consumes an expired pending translate.

## Surfaces in scope

- popup handoff producer (`pending-popup-handoff` channel)
- sidepanel handoff consumer + freshness check
- chrome.storage.local entry timestamp + clearing logic

## Hypotheses to test

1. Racing two popup handoff writes within the same task tick lets the
   sidepanel consume a handoff whose `ts` is older than the 60s ceiling.
2. Mutating the stored `ts` directly via storage.local.set bypasses the
   gate — the sidepanel trusts the field without bounding it against
   `Date.now()`.
3. System clock skew (set Date forward, write, set back) lets an entry
   appear future-dated; the gate compares `Date.now() - ts < 60_000`
   without abs, accepting negative deltas.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
