# Tooltip code-answer rubric

## State expectations

- Step 1: code or markup is translated; the answer is one fenced code block with a language tag.
- Step 2: the tooltip body shows the code in the code font, with its line breaks and indents kept, and without the fence lines.
- Step 3: the meta line names every language of mixed text ("Arabizi (Levantine) + English → English").
- Step 4: Copy copies the code that shows, not the fence lines.

## Visible affordances

- The code wraps inside the card; the card never scrolls sideways.

## Failure-mode expectations

- An answer that is prose with a fence in it, or two fenced blocks, stays plain text with its fences shown.
- A code answer that is still streaming, or cut off by an error, already shows as code.
- A re-run code answer shows no word diff.

## Cautions

- The side panel renders the same answer through Markdown, so a fence there is a code block with its own box; the tooltip shows only the code font.
