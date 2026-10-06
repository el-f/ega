# Popup keyboard-tab-order rubric

## Latency budgets

- Each Tab press moves focus within one frame.

## State expectations

- Step 1: the popup is mounted with a backend set up, so the header chip names it.
- Step 1b: with nothing prefilled, focus starts on "Translate page".
- Step 2: Tab from the top visits, in order: the backend chip, Open settings, the source language, the target language, "Translate page", the page tools list (one stop), the "Translate in the side panel" text box, then "Translate". The swap button is hidden while the source is Auto-detect.
- Step 3: every stop draws a visible focus ring.
- Step 4: inside the page tools list, Down moves to the next tool.
- Step 5: Enter on the backend chip opens its popover; Escape closes it and focus goes back to the chip.

## Visible affordances

- The order follows the layout top to bottom, left to right; nothing uses a positive tabindex.

## Failure-mode expectations

- A stop with no ring, a disabled control in the Tab order, or focus lost after Escape is a regression.

## Cautions

- When the picker is off in Settings, "Pick element" stays in the list as aria-disabled, with "Off in Settings" beside it.
