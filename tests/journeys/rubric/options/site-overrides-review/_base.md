# Site-overrides-review surface rubric

## Mount + render

- The card "Site overrides" has the line "Sites where Ega is off or uses its own source language" and an (i) "About site overrides" that says where they change: the right-click menu on a page.
- Rows list `sitePrefs` (an http/https pair with equal prefs merges into one bare-host row): the bare host (or the full origin when unmerged), the state in words ("Ega is off", "Source: Spanish", or both joined by " · "), and a trash IconButton "Remove <site>". The header has a secondary "Remove all".
- At 10 or more rows a "Filter sites" box narrows the list by host (case-insensitive); no match says so. Remove all still removes every row.
- Empty: EmptyState "No site overrides yet" / "Sites you turn off from the right-click menu show here", with no button and no Remove all.

## Remove

- Remove on a row acts at once: every key the row owns (both schemes for a merged row) leaves `sitePrefs`, focus moves to the next row, and a toast "Removed <site>" offers Undo.
- Remove all acts at once with a toast "Removed N site overrides" and Undo. Undo puts the old entries back and keeps any site changed since.

## Scope

- This surface is review + delete only — no creation flow. Site overrides come from the right-click "Disable Ega on this site" toggle and the last-direction memo after a selection translate.
