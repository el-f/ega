# Side panel reply about-instructions rubric

## Latency budgets

- More → "About this reply" -> section visible under the reply: <= 100ms.

## State expectations

- Step 1 (More → "About this reply"): the item is a checkbox, checked while the section is open. The section opens under the reply without a box, and focus moves to its heading.
- Step 2: rows name who answered, the languages, the time, the confidence and any change, then "Instructions sent ▸" with the character count.
- Step 3 (Instructions sent): the disclosure opens a scrollable plain-text block with the exact instructions the backend received. Over 6,000 characters it says "Cut at 6,000 of {n} characters."
- Step 4 (Close): the section closes and focus returns to the More button.
- With "Record request details" off, the section says "Not recorded. Turn on Record request details in Settings."

## Visible affordances

- The instructions block takes keyboard focus so it can be scrolled without a mouse.
- "Copy as JSON" copies the details.

## Failure-mode expectations

- An old reply saved before instructions were kept says "Not kept for this reply." instead of an empty block.

## Cautions

- The instructions are shown as text, never as HTML: page words inside them can never become markup.
