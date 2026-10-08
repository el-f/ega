# Popup surface rubric

## Mount + position

- Popup mounts in <= 400ms of toolbar click (the user is waiting on a single click).
- Popup is exactly 360px wide; never wider, never narrower.
- The body appears in its final layout: it waits for the page's answer and for the backend check (at most 500 ms), so the setup row never pushes the rows down after the first paint.
- The popup stays within Chrome's 600px cap with a toast up: in the tallest states a one-row text box with Translate beside it makes room, so the toast covers no control and nothing scrolls.

## Composition

- The popup is a launcher shell: the site switch, the default language pair, one "Translate page" button, a list of four page tools (Choose areas, Pick element, Translate clipboard, Open side panel) and a labelled "Translate in the side panel" text box.
- The popup does NOT host long-running work: text goes to the side panel via the `ega.pendingPopupHandoff` session slot, page translate and pick go to the active tab; then the popup closes.

## Affordances

- Each tool row has a label AND an icon. Icon-only rows are unacceptable.
- The active backend chip is visible top-right; click opens the fallback-order popover (read-only, with a Manage link); with no backend set up, the click opens Options → Backends.
