# Smart-bubble per-site-disabled rubric

## Latency budgets

- N/A — this is a non-render contract.

## State expectations

- Step 1: `sitePrefs[origin].disabled === true` (from the "Disable Ega on this site" context-menu item).
- Step 2: user makes an eligible selection on the host.
- Step 3: bubble does NOT mount. The page DOM has no bubble element.

## Visible affordances

- N/A — the affordance is the absence.

## Failure-mode expectations

- Storage read failure (chrome.storage error) defaults to the global setting — never silently re-enables on the disabled host.
- Per-site prefs are keyed by `location.origin`; `https://foo.example.com`, `https://example.com` and `http://example.com` are all distinct.

## Cautions

- This rubric guards the regression where a dismissed site silently re-enabled the bubble after a settings write to another field.
- The disabled check must run BEFORE the heuristic gate — short-circuit to save a regex run.
