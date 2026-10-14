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

- The tab list is fixed: every tab always renders and is never disabled.

## Cautions

- At container width <= 880px the rail collapses from 220px to a 48px icon-only column; labels and group headings hide, and each label shows as a tooltip on hover/focus.
- Group headings are visual organization only; they are not focusable / interactive.
