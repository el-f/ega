# Popup surface rubric

## Mount + position

- Popup mounts in <= 400ms of toolbar click (the user is waiting on a single click).
- Popup is exactly 360px wide; never wider, never narrower.

## Composition

- The popup is a launcher shell: the site switch, the default language pair, one "Translate page" button, a list of four page tools (Choose areas, Pick element, Translate clipboard, Open side panel) and a labelled "Translate in the side panel" text box.
- The popup does NOT host long-running work: text goes to the side panel via the `ega.pendingPopupHandoff` session slot, page translate and pick go to the active tab; then the popup closes.

## Affordances

- Each tool row has a label AND an icon. Icon-only rows are unacceptable.
- The active backend chip is visible top-right; click opens the fallback-order popover (read-only, with a Manage link); with no backend set up, the click opens Options → Backends.
