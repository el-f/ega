# Popup surface rubric

## Mount + position

- Popup mounts in <= 400ms of toolbar click (the user is waiting on a single click).
- Popup is exactly 360px wide; never wider, never narrower.

## Composition

- The popup is a launcher shell: 4 action tiles, language-pair selector, optional freeform composer.
- The popup does NOT host long-running work: text goes to the side panel via the `ega.pendingPopupHandoff` session slot, page translate and pick go to the active tab; then the popup closes.

## Affordances

- Each tile has a label AND an icon. Icon-only tiles are unacceptable.
- The active backend chip is visible top-right; click opens the fallback-order popover (read-only, with a Manage link); with no backend set up, the click opens Options → Backends.
