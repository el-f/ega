# Options-settings-search jump-to-result rubric

## Latency budgets

- Enter on result -> tab switch + scroll-anchor: <= 400ms.

## State expectations

- Step 1: result list has one or more active entries.
- Step 2 (Enter on the active result OR click): modal dismisses; left rail switches to the target tab; the panel scroll-anchors to the matching row.
- Step 3: the matched row receives focus (or a transient highlight) so the user knows where to look.

## Visible affordances

- A transient highlight on the destination row uses the accent token; auto-dismiss within 2s.
- The modal dismiss is a single animation frame; no flash.

## Failure-mode expectations

- A jump to a setting whose tab is currently unavailable (rare) surfaces a notice; modal stays open.

## Cautions

- Jump must scroll-anchor with `scroll-margin-top` to compensate for sticky tab chrome — never under the header.
- The destination row must NOT auto-edit / auto-open — the user lands on it but engages explicitly.
