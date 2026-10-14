# Popup site-switch rubric

## Latency budgets

- Switch click -> the switch and the status line change at once (optimistic); the stored write confirms within 2 s.

## State expectations

- Step 1: the popup opens over a website; the row "Ega on {host}" shows a switch that reads its state from settings.
- Step 2 (switch off): the switch is off, the status line says "Ega won't translate on this site.", and Translate page, Choose areas and Pick element are aria-disabled and described by that line. `sitePrefs[origin].disabled` is true.
- Step 3 (reopen, switch on): the switch reads off on reopen; switching it on removes the status line and deletes the site's row when it holds nothing else.

## Visible affordances

- The switch is a checkbox with role switch, named "Ega on {host}" (no "www."), with a visible label.
- Translate clipboard, Open side panel and the text box stay enabled while the site is off.

## Failure-mode expectations

- The write fails or does not answer in 2 s -> the switch flips back and a toast says "Ega couldn't save this change. Try again."

## Cautions

- The switch sets a state; it never toggles, so a repeated click lands on the same stored value.
