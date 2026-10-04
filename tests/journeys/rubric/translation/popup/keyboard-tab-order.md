# Popup keyboard-tab-order rubric

## Latency budgets

- Each Tab press moves focus within one frame; the composer takes focus as it opens.

## State expectations

- Step 1: the popup is mounted with a backend set up, so the header chip names it.
- Step 2: Tab from the top visits, in order: the backend chip, the theme button, Open settings, the source language, the target language, the four tiles, then "Translate something…". The swap button is skipped while the source is auto, because it is disabled.
- Step 3: every stop draws a visible focus ring.
- Step 4: Enter on "Translate something…" opens the composer and puts focus in its text box.
- Step 5: Enter on the backend chip opens its popover; Escape closes it and focus goes back to the chip.

## Visible affordances

- The order follows the layout top to bottom, left to right; nothing uses a positive tabindex.

## Failure-mode expectations

- A stop with no ring, a disabled control in the Tab order, or focus lost after Escape is a regression.

## Cautions

- The "Pick element" tile is skipped too when the picker is turned off in Settings.
