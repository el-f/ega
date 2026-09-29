# Options-shell surface rubric

## Layout

- Left rail lists every tab under group headings; tabs are buttons / role=tab nodes inside a tablist.
- Active panel is the only one mounted; switching unmounts the prior panel.

## Keyboard nav

- Arrow keys walk the active tablist; Home / End jump to first / last; Alt+digit jumps to the indexed tab.
- Tab key moves focus into the active panel content, not to the next rail entry.

## Persistence

- Active tab persists in `sessionStorage` for the duration of the tab; closing the Options tab clears the slot.

## A11y

- Tablist has a label; tabs carry `aria-selected`; panel is focusable on switch.
