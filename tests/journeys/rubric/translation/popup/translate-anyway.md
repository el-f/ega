# Popup translate-anyway rubric

## Latency budgets

- Popup open -> the status line names the reason in the first frame after the page answers (same tick as the selection prefill).
- Translate anyway click -> the tooltip opens on the page: <= 1 s plus the model's answer time.

## State expectations

- Step 1: the user selects English text on a page; smart mode holds the bubble back.
- Step 2: the popup opens; under the site switch the status line says "Bubble hidden: the text looks like English." with a "Translate anyway" button.
- Step 3 (Translate anyway): the popup closes and a tooltip opens on the page with the translation, anchored to the kept selection.

## Visible affordances

- The reason is visible text, never a hover label. The other reasons read "Bubble hidden: the selection is shorter than {n} characters." and "The selection bubble is off in Settings."

## Failure-mode expectations

- After 60 s, or when another selection is live, no reason shows.
- On a site where Ega is off, the popup shows the site-off line, not a held-back reason.
