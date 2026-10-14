# Page-translate whole-page-lazy rubric

## Latency budgets

- Translate page -> first requests sent: <= 1s on a long page (one collection pass, element references only).

## State expectations

- Step 1: on a page about 20 screens long, Translate page sends only the blocks within one screen of the viewport (at most about two screens' worth).
- Step 2: when those finish, the pill reads "{done} of {total} areas translated. The rest translate as you scroll."
- Step 3: scrolling to the middle sends the blocks near the new viewport; blocks the scroll jumped over are not sent.
- Step 4: Stop drops every waiting block; the pill reads "Stopped. Translated N of M areas." and a later scroll sends nothing.
- Step 5: More -> Remove translation puts the page back and removes the pill.

## Visible affordances

- The pill is one row: brand mark, one status sentence, then Stop while running.
- A 2px progress line runs along the pill's top edge while work is in flight.

## Failure-mode expectations

- A block already in the target language, or one the page removed, leaves the count; it is never sent.
- Content added after the start (infinite scroll) waits for the next Translate page.
- Closed fixed drawers with vertical scrolling, including a right drawer hidden by body overflow, leave the count and never send requests.
- An app pane and a wide table remain counted and translate when the user scrolls their own containers.

## Cautions

- A queued block that leaves the band before it is sent goes back to waiting, so a scrollbar drag does not spend requests on text nobody read.
