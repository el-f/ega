# Options-shell left-rail-renders rubric

## Latency budgets

- Shell mount -> left rail visible: <= 300ms.

## State expectations

- Step 1: user opens the Options page.
- Step 2: left rail mounts with every tab listed under its group heading.
- Step 3: the default tab is active; right panel mounts with its content.

## Visible affordances

- Group headings use a distinct type-scale; tabs use the project button tokens.
- Active tab carries the accent token; inactive tabs are neutral.

## Failure-mode expectations

- A tab whose underlying feature is disabled / unavailable surfaces a disabled state, not a missing entry — the rail layout stays stable.

## Cautions

- The rail must be the SAME width across all viewports — no shrinking on narrow screens.
- Group headings are visual organization only; they are not focusable / interactive.
