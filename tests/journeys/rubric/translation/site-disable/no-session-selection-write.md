# Site off-switch no-session-selection-write rubric

## Latency budgets

- None. This journey is about what does NOT happen.

## State expectations

- Step 1: the site carries `sitePrefs[origin].disabled === true`.
- Step 2: the user selects text on the page.
- Step 3: `chrome.storage.session['ega.lastSelection']` stays absent for the whole window.
- Step 4: on an enabled site the same selection does land in that key, so step 3 is a real gate and
  not a broken write path.

## Visible affordances

- None. The user sees no bubble and no toast — a plain selection on a disabled site is a no-op.

## Failure-mode expectations

- Parking the selection while the site is off means the popup later prefills text the user turned
  the extension off for. That is the defect this journey exists to catch.
- The write is on a short timer, so a single read right after the selection proves nothing.

## Cautions

- Read the key from an extension page; `chrome.storage.session` is not reachable from the host page.
- The selection cache is capped and origin-tagged; this journey checks presence only.
