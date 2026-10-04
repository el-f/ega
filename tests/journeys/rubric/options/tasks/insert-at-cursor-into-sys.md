# Options-tasks insert-at-cursor-into-sys rubric

## Latency budgets

- Focus system textarea -> click slot chip -> token inserted: <= 200ms.

## State expectations

- Step 1: user focuses the system textarea (placing caret at a specific position) then moves focus to the slot palette.
- Step 2 (click a slot chip): the `{{slot}}` token inserts into the system textarea at the caret position captured when system textarea was last focused.
- Step 3: the caret lands immediately after the inserted token; the system textarea regains focus.

## Visible affordances

- The slot chip click is a direct insert action — no intermediate popover for the basic chip click path.
- The `lastFocused` routing is transparent to the user; they click chip and the token appears in the right field.

## Failure-mode expectations

- If neither the system nor user textarea was recently focused, the token inserts into the user textarea by default (safe fallback).

## Cautions

- `lastFocused` routing must survive a brief focus-loss when the user's pointer moves from the textarea to the chip — do not clear on every blur.
- The insert must NOT overwrite surrounding text — it inserts at the caret, pushing existing text aside.
