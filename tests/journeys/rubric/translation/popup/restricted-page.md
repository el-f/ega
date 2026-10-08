# Popup restricted-page rubric

## Latency budgets

- Popup open -> the status line shows on the first paint; the popup never waits for the page, because it does not ask a page it cannot reach.

## State expectations

- Step 1: the popup opens over a `chrome://` page. Ega has no "tabs" permission, so Chrome gives it that tab with no address; that is how the popup knows Ega cannot run there. The status line says "Ega can't run on this page." There is no site switch.
- Step 2: Translate page, Choose areas and Pick element are aria-disabled and described by the status line. Translate clipboard and Open side panel stay enabled.
- Step 3: pressing Translate page or Choose areas sends nothing to the tab, and the popup stays open.
- Step 4: Open side panel opens the side panel beside that tab.

## Visible affordances

- Focus starts in the text box: there is no site switch or status action to start on, and the text box is what still works.
- The blocked actions keep their focus stops; their reason is visible text, not a hover tooltip.
- The text box and its Translate button stay usable: they go to the side panel, not the page.

## Failure-mode expectations

- None: nothing is sent, so nothing can fail.

## Cautions

- The Chrome Web Store, `chrome://`, `edge://` and other extensions' pages are all restricted; only http, https and file pages run Ega.
