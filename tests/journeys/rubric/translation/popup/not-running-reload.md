# Popup not-running-reload rubric

## Latency budgets

- Popup open -> the status line shows within 500 ms, the time the popup waits for the page to answer.
- Reload page click -> the tab starts reloading at once; the popup closes.

## State expectations

- Step 1: the popup opens over a website tab whose content script does not answer (the page was open before Ega was installed or updated).
- Step 2: the status line says "Reload this page to use Ega here." with a Reload page button. Translate page, Choose areas and Pick element are aria-disabled and described by that line. Focus starts on Reload page.
- Step 3: Reload page reloads that tab. The fresh page runs the content script, so the next popup shows the default state.

## Visible affordances

- Reload page is the status line's own action, at the end of its text.
- The site switch still shows and reads from settings, because the site's on/off state does not need the page.

## Failure-mode expectations

- The reload call fails -> nothing happens in the popup; the error goes to the debug log.

## Cautions

- A tab that cannot be reached because it is restricted shows the restricted state instead, never this one.
