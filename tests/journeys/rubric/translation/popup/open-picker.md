# Popup open-picker rubric

## Latency budgets

- Pick element click -> picker overlay mounts on active tab: <= 400ms.
- Popup close: <= 200ms after dispatch.

## State expectations

- Step 1: popup is mounted with Pick element enabled.
- Step 2 (click Pick element): `picker:enter` message is dispatched to the active tab; popup closes; picker overlay mounts on the page.
- Step 3: user can pick an element on the page; picker exits on click or Esc per the vision/picker rubric.

## Visible affordances

- Pick element is aria-disabled when the picker is off in Settings (visible "Off in Settings"), when Ega is off on this site, or on a page Ega cannot run on; the reason is visible text and its description.

## Failure-mode expectations

- Content script not loaded -> the popup status line says "Reload this page to use Ega here." with a Reload page button.

## Cautions

- The row must close the popup window even if the picker mount is async — the user expects the popup gone immediately after click.
- The picker overlay lives in the active tab's content; the popup has no visibility into picker state.
