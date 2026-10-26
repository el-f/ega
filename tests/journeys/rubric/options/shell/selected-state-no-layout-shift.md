# Options-shell selected-state-no-layout-shift rubric

## Latency budgets

- Effort segment click -> checked state: <= 1 frame.
- Effort pick -> stored in `ega.settings`: <= 500ms.
- Nav tab click -> `aria-selected` flips: <= 1 frame.

## State expectations

- Step 1: the Translate tab is open; the Effort group shows its default pick.
- Step 2 (click High, then Low): the clicked segment is checked and stored.
- Step 3 (click Backends in the nav): the Backends tab is selected and its heading shows.

## Visible affordances

- The selected segment shows by fill, an inset edge and weight 600.
- The selected nav item shows by fill, its side marker and weight 600.
- Every label holds its bold width at rest, so the label that turns bold and the one that turns back keep one width.
- No button in the Effort group or the nav moves or resizes by more than 1 px.

## Failure-mode expectations

- A pick that fails to save leaves the old segment checked; the group does not move.

## Cautions

- The probe reads offset boxes, not viewport boxes: Playwright scrolls before a click.
- `font-weight`, `padding`, `border-width`, `margin` and `max-height` in a selected rule fail `pnpm lint:hover`,
  unless the line carries a `hover-lint-allow` marker that names the sizer holding the space.
