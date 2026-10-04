# Goal: live-displaymode-flicker

You are exploring the ega Chrome extension. Your goal is to switch the
display mode (`defaultDisplayMode`) rapidly in options while a tooltip
is open on a page and observe whether the tooltip flickers, loses its
body, or unmounts unexpectedly.

## Surfaces in scope

- options Translate tab, Display surface section (Tooltip / Inline mode cards)
- content-script tooltip mount (shadow host, body renderer)
- `watchSettings` listener in the content script (storage change -> worker read -> settings cache)

## Hypotheses to test

1. Switching the display mode tooltip → inline → tooltip within 200ms triggers
   two unmount/mount cycles; the tooltip body's IntersectionObserver
   leaks and the second mount renders without text.
2. Toggle during a streaming explain mid-flight remounts the tooltip,
   losing the partial stream buffer; the final `done` frame arrives at
   the unmounted host and is dropped.
3. DisplayModeMock preview in options shares state with the live
   content-script instance; preview clicks leak into the real page
   tooltip until next reload.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
