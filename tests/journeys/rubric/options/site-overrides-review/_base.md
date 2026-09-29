# Site-overrides-review surface rubric

## Mount + render

- Surface lists hosts present in `sitePrefs` as read-only rows; each row names host + override fields + a Clear action.
- Empty state names what a site override is (and points the user at the picker / smart-bubble settings).

## Clear

- Per-row Clear removes the host entry from `sitePrefs` without confirm — the entry is recoverable on the source surface (smart-bubble dismiss, etc.) so confirm would be friction.
- Clear-all empties `sitePrefs` after explicit confirm (destructive bulk action).

## Scope

- This surface is review + delete only — no creation flow. Site overrides are created by the smart-bubble or picker on the page itself.
