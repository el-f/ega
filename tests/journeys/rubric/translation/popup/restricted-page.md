# Popup restricted-page rubric

## Latency budgets

- Popup open -> the status line shows on the first paint; the popup never waits for the page, because it does not ask a page it cannot reach.

## State expectations

- Step 1: the popup opens over `chrome://extensions/`. The status line says "Ega can't run on this page." There is no site switch.
- Step 2: Translate page, Choose areas and Pick element are aria-disabled and described by the status line. Translate clipboard and Open side panel stay enabled.
- Step 3: pressing Translate page or Choose areas sends nothing to the tab, and the popup stays open.

## Visible affordances

- The blocked actions keep their focus stops; their reason is visible text, not a hover tooltip.
- The text box and its Translate button stay usable: they go to the side panel, not the page.

## Failure-mode expectations

- None: nothing is sent, so nothing can fail.

## Cautions

- The Chrome Web Store, `chrome://`, `edge://` and other extensions' pages are all restricted; only http, https and file pages run Ega.
