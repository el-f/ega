# Options-display surface rubric

## Mount + render

- The "Where answers show" card is the first card of the Answers tab: title, (i), one line "A tooltip over the selection, or the answer in place of the text".
- Mode picker (Tooltip / Inline) is two radio cards inside a `role="radiogroup"`, each with a small picture of the mode; the active card carries the accent border.

## Groups

- "Tooltip and side panel": Show confidence pill, and under it "Hide the pill below" with its hint "0 shows the pill on every answer".
- "Tooltip only": Show the original text at the top, Close when I click outside (hint "Hides the close button"), Let me drag the tooltip.
- Both groups stay on screen in Inline mode too, because the side panel and Explain still use them. There is no filler note.
- There is no image "opens in" select: each right-click image action sets where it opens.

## Reset

- One "Reset section" pill in the card header, only while an option differs from its default; it acts at once and a toast says "Where answers show is back to defaults" with Undo.
- Reset never changes the mode.
