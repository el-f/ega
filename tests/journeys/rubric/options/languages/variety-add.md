# Options-languages variety-add rubric

## Latency budgets

- Notes typed -> language created: <= 1s (the save waits for a 600 ms pause).

## State expectations

- Step 1: the user presses "Add language" in the card header; the dialog "New language" opens with focus on its title, and the footer says "Not saved yet: add a name".
- Step 2: the user types a name (the footer says "Not saved yet: add notes"), then notes.
- Step 3: the language lands in `customLanguages`; after Done the row shows with a "Custom" pill.

## Visible affordances

- Name and Notes have visible labels; Notes shows "What the model should know about this language" and a counter.
- Examples start empty with the hint "3 to 5 short pairs help the most".

## Failure-mode expectations

- Closing with a name but no notes asks "Discard this language?"; Keep editing keeps the dialog.
- At 200 custom languages the footer says to delete one before adding another.

## Cautions

- The new language is usable at once in the language pickers on every surface.
