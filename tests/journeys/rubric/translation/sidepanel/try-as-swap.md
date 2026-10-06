# Sidepanel try-as-swap rubric

## Latency budgets

- Swap pick -> re-answer request fired: <= 100ms.
- First swapped token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: the newest reply is done; its action row ends with a Refine button, a Try as button and the More (⋯) menu, on one line.
- Step 2 (open Try as): the menu lists "Swap languages (<new source> → <new target>)" first, then a separator, then the tasks with the current one checked. A keyboard open puts focus on the swap item.
- Step 3 (pick the swap): the menu closes and the last turn gains a 2/2 variant answered in the old source language; a "→ <language>" chip names it.
- Blocked case: when the reply has no source language to swap from, the swap item stays in the menu, reads as disabled, and shows the reason as text under its label. Picking it sends nothing and leaves the menu open.

## Visible affordances

- There is no separate Swap / "Try as…" row under the reply.
- The Try as button is a 32px icon button with the name "Try as another task" and a short "Try as…" hover label.
- A blocked swap's reason is visible text in the item, not a hover-only tooltip.

## Failure-mode expectations

- While another reply streams, the Try as button reads as disabled, names the wait in its label, and opens no menu.

## Cautions

- The swap re-runs the same user turn; it never appends a new user turn.
- Earlier turns have no Try as button.
