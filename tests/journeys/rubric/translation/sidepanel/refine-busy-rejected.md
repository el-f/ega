# Sidepanel refine-busy-rejected rubric

## Latency budgets

- Refine menu open while another version runs: <= 100ms.

## State expectations

- Step 1: the first reply is done; Refine → Shorter starts version 2, which keeps running.
- Step 2: Previous version shows version 1 again (1/2); its meta line says "Version 2 loading…".
- Step 3: the Refine menu opens with the note "Wait for the current reply to finish." Every re-run item stays in the menu with `aria-disabled` and that note as its description.
- Step 4: a click on such an item sends nothing; exactly two requests have gone out and the pager stays on 1/2.

## Visible affordances

- The items stay in the arrow-key order and read as unavailable, so the user sees why nothing happens.
- Regenerate is `aria-disabled` too, named "Regenerate (wait for the current reply)".

## Failure-mode expectations

- If version 2 fails, the wait ends and the items work again.

## Cautions

- The refusal is enforced in the state machine as well: `refine()` bails while a reply is running (unit-tested).
