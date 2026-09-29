# Popup surface rubric

## Mount + position

- Popup mounts in <= 400ms of toolbar click (the user is waiting on a single click).
- Popup is exactly 360px wide; never wider, never narrower.

## Composition

- The popup is a launcher shell: 4 action tiles, language-pair selector, optional freeform composer.
- The popup does NOT host long-running streams. Anything that takes >1s should hand off to the sidepanel via the `pending-popup-handoff` channel and close the popup.

## Affordances

- Each tile has a label AND an icon. Icon-only tiles are unacceptable.
- The active backend chip is visible top-right; click opens the chain popover (view-only — no input).
