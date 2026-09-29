# Options-shell deep-link-settings-search rubric

## Latency budgets

- Ctrl+, -> modal open: <= 150ms.
- Enter on result -> tab switch + scroll-anchor + flash: <= 400ms.

## State expectations

- Step 1: user presses Ctrl+, anywhere inside Options shell; settings-search modal mounts with input focused.
- Step 2: user types a query; the result list narrows to matching entries showing target tab names.
- Step 3: user selects a result (Enter or click); modal dismisses, left rail switches to the target tab, and the destination card receives a transient accent-highlight flash.

## Visible affordances

- Modal carries `aria-modal="true"`; focus is trapped while open.
- Matched substring in each result row is highlighted with the accent token.
- Destination card flashes with accent border (auto-clears after ~1.5s).

## Failure-mode expectations

- Empty query surfaces no results (not the full registry — would be enormous).
- Zero matches surfaces an empty-state copy: "No setting matches \"<query>\"".
- A jump to a tab that is unavailable shows a notice; modal stays open.

## Cautions

- Scroll-anchor must clear sticky chrome; use `scroll-margin-top` on the destination card.
- Destination card must NOT auto-open an edit field on jump — user lands and engages explicitly.
- Ctrl+, must NOT fire from inside a text input inside Options.
