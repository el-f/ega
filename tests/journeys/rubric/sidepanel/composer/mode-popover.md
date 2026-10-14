# Side panel composer mode-popover rubric

## Latency budgets

- Mode chip click -> "Next message" popover visible: <= 100ms.
- A pick -> the chip label updates: <= 50ms.

## State expectations

- Step 1: the mode chip names what the next message does ("Translate → English"); its accessible name starts with the same words, with the arrow read as "to".
- Step 2 (chip): a "Next message" popover opens above the chip with the sections Task, Language, Tone (only for a task with a tone) and Page info (only when the task sends page info).
- Step 3: every pick applies at once and the popover stays open. The chip follows: "Reword · Casual", "Translate · Spanish → English".
- Step 4: the swap button shows only when it can act (a real source language, or Auto-detect with a detected language).
- Step 5: the page info level is saved to Settings at once. With page info off in Settings the section says "Page info is off." with a "Turn on in Settings" button.
- Step 6 (Esc): the popover closes and focus returns to the chip.

## Visible affordances

- The task picker is a radio group with a check glyph on the picked task, not colour alone.
- The popover fits the panel at 256px without a sideways scroll.

## Failure-mode expectations

- A settings write that fails puts the control back and shows a toast.

## Cautions

- Changing the target language never re-runs an earlier reply by itself; that is the reply's "Translate into" item.
