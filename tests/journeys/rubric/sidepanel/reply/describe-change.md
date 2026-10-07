# Side panel reply describe-change rubric

## Latency budgets

- "Describe a change…" -> composer in change mode with focus: <= 100ms.
- Send -> refine request fired: <= 100ms.

## State expectations

- Step 1 (Refine → "Describe a change…"): the composer keeps the draft aside, clears the box, shows "Changing this reply ×" in place of the mode chip, uses the placeholder "Describe the change", and takes focus. The reply's Refine button shows pressed.
- Step 2 (type and Send): the reply gets a new version (pager 2/2) built from the typed change. Its meta line says "Your change", and About this reply quotes the change.
- Step 3: the mode ends and the saved draft comes back into the box.
- Esc or × leaves the mode without sending and restores the draft.

## Visible affordances

- The banner chip has a × named "Cancel change", with the tooltip "Cancel change (Esc)".
- Next-send info (page info, history) is hidden in change mode; it does not apply to a refine.

## Failure-mode expectations

- A failed change shows the error on the new version with "Try again"; version 1 stays reachable.

## Cautions

- The typed change goes into that one request only; it is never saved as a rule.
