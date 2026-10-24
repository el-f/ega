# Tooltip field-selection-in-viewport rubric

## State expectations

- Step 1: a selection inside a text field (GitHub's code view: a transparent textarea over the code) shows the bubble next to the selected lines, not next to the whole field.
- Step 2 (translate shortcut, or a click on the bubble): the tooltip opens above or below the selected lines, within 40px of them, inside the viewport, and does not cover them. The same holds when the window is shorter than the file (500px for a 38-line file).
- Step 3 (page scroll): the tooltip follows the selected lines, within 40px of them. It moves to the other side only when it now fits there.
- Step 4 (selection taller than the room on both sides, e.g. Ctrl+A in the field): the card overlaps the selection inside the viewport; its top bar, answer, meta row and actions all show. A long answer gets room up to the window height, not a short box that scrolls after a few lines.
- Step 5 (a word picked in a wrapping comment box): the bubble shows under that word, not under the whole box.

## Visible affordances

- The whole card is visible: never just the top bar with the task select and the close button.

## Failure-mode expectations

- A field selection never anchors to the field's whole box when the selected text can be measured.
- An `<input>` selection keeps the field's box as its anchor (one line high).
- A click in the field, or other text picked in it, while the card is open does not move the card: it stays with the text it opened on. A Retry, task switch or Regenerate after that click keeps it there too.
- Measuring the selected text lays it out in a hidden node on the page, so it never runs for a secret field or on a site that is turned off.

## Cautions

- Measuring the selected text must stay cheap on a long file: it runs for each bubble shown during a drag and once when the card opens. A scroll moves the anchor with the field and measures nothing.
