# Conversation hover-no-layout-shift rubric

## Latency budgets

- Pointer enters a turn -> action row fully opaque: <= 150ms.
- Pointer leaves -> action row fully transparent: <= 150ms.

## State expectations

- Step 1 (at rest): every turn reserves the action-row band; the row is transparent and not clickable.
- Step 2 (hover a turn): only opacity changes. Every turn's offsetTop, offsetHeight and offsetWidth stay identical, and the stream's scrollHeight is unchanged.
- Step 3 (hover each turn in sequence): geometry stays identical for all of them — no cumulative drift.
- Step 4 (focus an action button by keyboard): the row reveals with the same geometry as hover.

## Visible affordances

- Action buttons stay in the tab order while the row is transparent, so :focus-within can reveal it.
- The revealed row reads as belonging to its turn, not to the turn below.

## Failure-mode expectations

- A turn that grows on hover pushes every turn below it down the scroller; the list appears to jump as the pointer sweeps across it. This is the defect the flow guards.
- A turn that grows near the pointer's edge can move out from under the cursor and toggle hover on and off repeatedly.

## Cautions

- Measure with offsetTop / offsetHeight, never getBoundingClientRect: Playwright's hover() scrolls the target into view first, which translates every viewport rect and reads as a false shift.
- visibility: hidden must not be used for the resting state — it removes the buttons from the tab order, so :focus-within never fires and the keyboard path dies.
- Reserving the band costs vertical space in a narrow panel; that is the accepted trade against the jump.
