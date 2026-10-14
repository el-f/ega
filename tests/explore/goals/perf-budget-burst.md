# Goal: perf-budget-burst

You are exploring the ega Chrome extension. Your goal is to find a UI
interaction that violates the documented budgets — slider commit latency,
audit panel render under load, sidepanel turn append while streaming.

## Surfaces in scope

- options Tunables (sliders, suggestion chips)
- options Audit Log (filter row, severity grouping)
- sidepanel streaming buffer + final-text replace

## Hypotheses to test

1. Holding a slider's arrow-key for 2 seconds dispatches one input event
   per frame and re-renders the whole Tunables tab each time.
2. Filtering the audit log while a translate is streaming blocks the
   stream UI for >100ms on the next chunk.
3. Pasting 8KB of text into the sidepanel composer freezes the textarea
   for >200ms because the live token-count debounce isn't installed yet.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
