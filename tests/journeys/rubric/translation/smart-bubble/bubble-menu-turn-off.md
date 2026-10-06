# Smart-bubble bubble-menu-turn-off rubric

## Latency budgets

- Chevron click -> menu visible: <= 300ms (the menu chunk loads on first open).
- Turn off on this site -> bubble gone and toast shown: <= 500ms.

## State expectations

- Step 1: a selection shows the bubble, "Translate to {target}" with a chevron segment named "Bubble options".
- Step 2: the chevron opens a two-item menu under the bubble: "Turn off on this site", "Bubble settings".
- Step 3: Turn off on this site sets `sitePrefs[origin].disabled`, hides the bubble and shows the toast "Ega is off on {host}. Turn it back on from the Ega toolbar button." with Undo.
- Step 4: Undo removes the site's row again (the switch is a set, not a toggle).

## Visible affordances

- The chevron is an ARIA menu button (`aria-haspopup="menu"`, `aria-expanded`); the items are menuitems. Enter, Space or Down opens the menu with focus on the first item; Esc closes it and returns focus to the chevron.

## Failure-mode expectations

- The write fails -> the toast says "Ega couldn't save this change. Try again." and the site stays on.

## Cautions

- "Bubble settings" opens Settings -> Selection & picker.
