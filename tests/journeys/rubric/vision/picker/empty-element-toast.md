# Picker empty-element-toast rubric

## Latency budgets

- Click on empty element -> overlay dismiss + toast: <= 300ms.

## State expectations

- Step 1: picker overlay is mounted; user clicks an element with no text and no image content (e.g., a spacer `<div>`).
- Step 2: the picker overlay dismisses; a toast surfaces ("Nothing translatable here").
- Step 3: the user must re-enter picker via the popup tile to try again.

## Visible affordances

- Toast uses the warning tone tokens; carries a re-enter affordance ("Pick again") that dispatches a fresh `picker:enter`.

## Failure-mode expectations

- Whitespace-only content counts as empty.
- An element with only a child image -> the image branch fires, NOT the empty-element branch.

## Cautions

- The toast must NOT mount the picker again automatically — the user picks explicitly.
- Empty-element detection must not run a heavy DOM walk; a single check on `textContent` + child `<img>` is enough.
