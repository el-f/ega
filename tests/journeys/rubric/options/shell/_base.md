# Options-shell surface rubric

## Layout

- Left rail lists every tab under group headings; tabs are buttons / role=tab nodes inside a tablist.
- Active panel is the only one mounted; switching unmounts the prior panel.

## Keyboard nav

- Arrow keys walk every rail tab across both group tablists and loop at the ends; Home / End jump to first / last; Alt+digit jumps to the indexed tab.
- Tab key moves focus into the active panel content, not to the next rail entry.

## Persistence

- Active tab is not persisted: each load opens on Translate, unless a caller parked a target tab (`ega.pendingOptionsTab` in chrome.storage.local), which is read once and removed.

## A11y

- Tablist has a label; tabs carry `aria-selected`; panel is focusable on switch.
