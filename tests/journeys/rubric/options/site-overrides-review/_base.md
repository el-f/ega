# Site-overrides-review surface rubric

## Mount + render

- Surface lists `sitePrefs` as read-only rows (an http/https pair with equal prefs merges into one bare-host row); each row shows the bare host (or the full origin when unmerged), an "Ega off" pill when disabled, a "Source: <language name>" pill when a source language is set, and an X icon button (danger tone) to clear it. Clear all is a danger Button; Export is a secondary Button.
- At 10 or more rows a "Filter sites" box narrows the list by host (case-insensitive); no match says so. Clear all still clears every row.
- Empty state reads "No site overrides yet" and points the user at right-click > "Disable Ega on this site".

## Clear

- Per-row Clear opens a "Clear site override" danger confirm; confirming removes every key the row owns (both schemes for a merged row) from `sitePrefs`.
- Clear-all empties `sitePrefs` after explicit confirm (destructive bulk action).

## Scope

- This surface is review + delete only — no creation flow. Site overrides come from the right-click "Disable Ega on this site" toggle and the last-direction memo after a selection translate.
