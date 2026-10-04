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

- If the target row never renders, the tab still switches and the pending target is cleared silently; the modal closes either way.

## Cautions

- Jump focuses the target then scrolls it into view at the top with scrollIntoView (smooth; instant under reduced motion), and flashes it for 800ms.
- The destination row must NOT auto-edit / auto-open — the user lands on it but engages explicitly.
