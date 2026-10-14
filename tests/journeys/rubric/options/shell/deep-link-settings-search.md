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
- Destination card flashes an accent ring (`data-flash`, cleared after 800ms; no animation under reduced motion).

## Failure-mode expectations

- Empty query shows a hint plus the Popular settings list (and a Recently used list once the user has picked results before), never the full registry.
- Zero matches surfaces: No settings match "<query>". Check the spelling or try a different word. (With Modified only on and unfiltered hits: "No modified settings match — uncheck Modified only.")
- Selecting a result always closes the modal; if the target never renders, the tab still switches and nothing flashes.

## Cautions

- Scroll-anchor uses scrollIntoView to the top of the card (smooth, instant under reduced motion) and focuses the card.
- Destination card must NOT auto-open an edit field on jump — user lands and engages explicitly.
- Ctrl+, must NOT fire from inside a text input inside Options.
