# Goal: escalation-chain-collision

You are exploring the ega Chrome extension. Your goal is to invoke
Continue + Pin + Open in rapid sequence (multiple escalation slots
fighting each other) and verify no orphaned slots remain — last opener
should win cleanly.

## Surfaces in scope

- tooltip escalation slots (Continue, Pin-to-sidepanel, Open)
- sidepanel handoff consumer (single pending slot)
- chrome.storage.local pending-* keys + clear-on-consume

## Hypotheses to test

1. Continue + Pin + Open all fire within one task tick. Each writes a
   distinct pending-* slot; sidepanel mounts and consumes one, but the
   other two slots remain in storage indefinitely as orphans.
2. Pin then Open within 200ms — Open's handoff replaces Pin's entry,
   but the storage write is racy: sidepanel reads after Pin's write
   but before Open's, then Open's write fires too late to be consumed.
3. Two tabs with open tooltips each click Pin simultaneously; both
   handoff entries arrive at one sidepanel; sidepanel consumes one and
   silently drops the other without an audit entry.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
