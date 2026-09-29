# Templates-editor a11y-templates-chip rubric

## Latency budgets

- N/A — this is an a11y contract.

## State expectations

- Step 1: editor surface mounts with the chip rail.
- Step 2: axe-core flow-level a11y scan passes — no contrast violations, no missing labels.
- Step 3: keyboard navigation walks chips with arrow keys; Enter activates; focus visible at every step.

## Visible affordances

- Chip rail has `role="tablist"`; chips have `role="tab"`; the active chip has `aria-selected="true"`.
- Focus ring uses a high-contrast token visible in light + dark themes.

## Failure-mode expectations

- A regression that adds an inaccessible control to the chip rail (icon-only without aria-label) fails this rubric.

## Cautions

- Active chip must be the only `tabindex=0`; non-active chips are `tabindex=-1` per ARIA tablist pattern.
- Chip text must have minimum 4.5:1 contrast in both themes.
