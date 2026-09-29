# Goal: crash-tooltip-via-input

You are exploring the ega Chrome extension. Your goal is to make the
content-script tooltip mount, error, leak, or fail to dismiss using only
DOM-level input on a host page (selection, hover, keyboard, drag).

## Surfaces in scope

- content-script shadow host (smart bubble, tooltip)
- tooltip topbar (copy / explain / image-translate / close)
- selectionchange + pointer/keyboard listeners

## Hypotheses to test

1. Selecting text in a same-origin iframe that the extension is allowed
   into mounts a second tooltip without dismissing the parent's.
2. Triggering selection + immediate Escape during the open animation
   leaves the shadow host in the DOM with `aria-hidden="true"` but the
   tooltip body still mounted (offscreen leak).
3. Pasting unicode RTL marks into the explain input flips the topbar
   button order and re-orders the close button into a non-clickable slot.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
