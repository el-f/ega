# Site off-switch page-translate-blocked rubric

## Latency budgets

- `page:translateAll` -> toast: <= 300ms.

## State expectations

- Step 1: the site carries `sitePrefs[origin].disabled === true`.
- Step 2: the user runs translate-areas (context menu, popup tile, or shortcut).
- Step 3: a toast says the site is off. Translate-areas mode never becomes active.
- Step 4: no picker overlay, no multi-select toolbar, no batch progress pill mounts.

## Visible affordances

- Nothing on the page gains a hover outline or a selection cursor.
- The page's own click handling is untouched — a click after the blocked call behaves normally.

## Failure-mode expectations

- Entering the mode and leaving it again is a failure: the overlay swallows the user's next click.
- An automatic page-translate on a disabled site must stay silent, with no toast at all.

## Cautions

- The mode flag can flip true for one frame; sample it across a window.
- The fixture page must have translatable blocks, or "no mode" is trivially true.
