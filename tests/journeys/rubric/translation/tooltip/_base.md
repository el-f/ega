# Tooltip surface rubric

## Mount + position

- Selection bubble appears within 200ms of selection-change.
- Tooltip mounts within 350ms of bubble click.
- Tooltip opens below the selection and flips above when it does not fit below (20px viewport margin); horizontally it stays inside the viewport.

## Close affordances

- Esc closes the tooltip without losing the selection.
- Click-outside closes the tooltip unless the `tooltipClickOutside` setting is off (default on). Image tooltips always show a manual close button, but click-outside dismiss still follows the setting.
- A top-row "x" close is visible when `clickOutsideDismiss` is off OR when the tooltip carries an image.

## Latency

- First token visible within 1.5s for cached / warm-CLI paths.
- Cold cloud paths show a progress shimmer within 400ms of mount.
