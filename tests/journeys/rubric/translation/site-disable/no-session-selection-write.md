# Site off-switch no-session-selection-write rubric

## Latency budgets

- None. This journey is about what does NOT happen.

## State expectations

- Step 1: the site carries `sitePrefs[origin].disabled === true`.
- Step 2: the user selects text on the page, then the live selection goes (as when the popup opens).
- Step 3: the content script answers `ega:get-selection` with an empty text for the whole window,
  and `chrome.storage.session['ega.lastSelection']` stays absent.
- Step 4: on an enabled site the same steps return the selection the page dropped, so step 3 is a
  real gate and not a broken path. The selection is still never written to storage.

## Visible affordances

- None. The user sees no bubble and no toast — a plain selection on a disabled site is a no-op.

## Failure-mode expectations

- Keeping the selection while the site is off means the popup later prefills text the user turned
  the extension off for. That is the defect this journey exists to catch.
- The page remembers a selection after an async settings read, so a single read right after the
  selection proves nothing.

## Cautions

- Ask from an extension page with `chrome.tabs.sendMessage`; the content script answers only its
  own extension.
- The remembered selection is capped and kept for one minute; this journey checks presence only.
