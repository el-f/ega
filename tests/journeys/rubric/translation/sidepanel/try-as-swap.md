# Sidepanel try-as-swap rubric

## Latency budgets

- Swap pick -> re-answer request fired: <= 100ms.
- First swapped token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: the newest reply is done; its action row ends with a Refine button, a Re-run as button and the More (⋯) menu, on one line.
- Step 2 (open Re-run as): the menu lists "Swap languages (<new source> → <new target>)" first, then a separator, then the tasks with the current one checked. A keyboard open puts focus on the checked task, so a second Enter re-runs nothing; ArrowUp reaches the swap item.
- Step 3 (pick the swap): the menu closes and the last turn gains a 2/2 variant answered in the old source language; a "→ <language>" chip names it. While the swap runs, focus waits on the reply card, never on the page body.
- Blocked case: when the reply has no source language to swap from, the swap item stays in the menu, reads as disabled, and shows the reason as text under its label. Picking it sends nothing and leaves the menu open.
- Repeat case: after the swap finished, the swap item reads "Already answered this way" and sends nothing. An auto-detected source that equals the target reads "Source and target are the same language", never "Hebrew → Hebrew".

## Visible affordances

- There is no separate Swap / "Re-run as…" row under the reply.
- The Re-run as button is a 32px icon button with the name "Re-run with another task or language" and a short "Re-run as…" hover label drawn by the same tooltip as the icon buttons beside it.
- A blocked swap's reason is visible text in the item, not a hover-only tooltip.

## Failure-mode expectations

- While another reply streams, the Re-run as button reads as disabled, names the wait in its label, and opens no menu.

## Cautions

- The swap re-runs the same user turn; it never appends a new user turn.
- Earlier turns have no Re-run as button.
