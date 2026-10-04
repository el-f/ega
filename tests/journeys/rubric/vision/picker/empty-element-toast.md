# Picker empty-element-toast rubric

## Latency budgets

- Click on empty element -> overlay dismiss + toast: <= 300ms.

## State expectations

- Step 1: picker overlay is mounted; user clicks an element with no text (e.g., a spacer `<div>`).
- Step 2: the picker overlay dismisses; a toast surfaces ("Nothing to translate in that element.").
- Step 3: the user re-enters picker (popup tile, picker shortcut, or context menu) to try again.

## Visible affordances

- Toast is a plain notice (no action button, no tone variant) that clears after about 3s.

## Failure-mode expectations

- Whitespace-only content counts as empty.
- An element with only a child image has no text -> the empty-element branch fires (no image branch exists).

## Cautions

- The toast must NOT mount the picker again automatically — the user picks explicitly.
- Empty-element detection is a single trimmed `innerText` (fallback `textContent`) check; no DOM walk, no `<img>` check.
