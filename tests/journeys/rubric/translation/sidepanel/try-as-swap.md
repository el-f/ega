# Sidepanel try-as-swap rubric

## Latency budgets

- Swap pick -> re-answer request fired: <= 100ms.
- First swapped token: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: a reply is done with a known source and target ("Spanish → English" in its meta line).
- Step 2 (open the reply's Refine menu): the last item reads "Swap: English → Spanish". A keyboard open lands on the first preset; End reaches the swap.
- Step 3 (pick the swap): the menu closes and the reply gains version 2 (pager 2/2), answered the other way; its meta line reads "English → Spanish". While the swap runs, focus waits on the reply, never on the page body.
- Repeat case: swapping back would only repeat version 1, so the menu no longer offers a swap.
- No source case: a reply with no known source language (Auto-detect, nothing detected) has no swap item.

## Visible affordances

- There is no separate swap row under the reply; the swap is a Refine menu item.
- A swap that cannot run is not shown, so there is no disabled item to explain.

## Failure-mode expectations

- While another reply runs, the swap stays in the menu with `aria-disabled` and the note "Wait for the current reply to finish."

## Cautions

- The swap re-runs the same message; it never appends a new message.
- Every reply has the same row, so an older reply can be swapped too.
