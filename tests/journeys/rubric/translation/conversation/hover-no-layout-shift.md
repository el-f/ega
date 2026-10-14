# Conversation hover-no-layout-shift rubric

## Latency budgets

- Pointer enters a turn -> action row fully opaque: <= 150ms.

## State expectations

- Step 1 (at rest): every turn shows its action row, opaque and clickable, in a band at least 28px tall; buttons rest muted.
- Step 2 (hover a turn): the row stays as it was (opacity 1). Every turn's offsetTop, offsetHeight and offsetWidth stay identical, and the stream's scrollHeight is unchanged.
- Step 3 (hover each turn in sequence): geometry stays identical for all of them — no cumulative drift.
- Step 4 (focus an action button by keyboard): the row stays visible and the turn's geometry does not change.

## Visible affordances

- Each action row is one tab stop (roving tabindex); ArrowLeft/ArrowRight/Home/End move between its buttons.
- The revealed row reads as belonging to its turn, not to the turn below.

## Failure-mode expectations

- A turn that grows on hover pushes every turn below it down the scroller; the list appears to jump as the pointer sweeps across it. This is the defect the flow guards.
- A turn that grows near the pointer's edge can move out from under the cursor and toggle hover on and off repeatedly.

## Cautions

- Measure with offsetTop / offsetHeight, never getBoundingClientRect: Playwright's hover() scrolls the target into view first, which translates every viewport rect and reads as a false shift.
- The row must not hide or collapse at rest; a row that appears on hover or focus would reflow the stream.
- Reserving the band costs vertical space in a narrow panel; that is the accepted trade against the jump.
