# Sidepanel refine-preset rubric

## Latency budgets

- Preset pick -> refine request fired: <= 100ms.
- First refined token: warm <= 1.5s.

## State expectations

- Step 1: a reply has finished; its action row shows Copy, Regenerate, Refine and More. Refine opens a menu whose first items are the task's presets (Translate: "Shorter", "Less formal", "Keep slang"), then "Describe a change…". A keyboard open lands on the first preset.
- Step 2 (pick a preset): the menu closes, focus moves to the reply, and the reply gains a new version (pager 2/2) that streams the refinement of the same message. Version 1 stays reachable with the pager.
- Step 3: the finished version names the preset in its meta line (for example "Shorter").

## Visible affordances

- Presets are menu items with text labels, reachable with the arrow keys and type-ahead.
- While another reply runs, the presets stay in the menu with `aria-disabled` and the note "Wait for the current reply to finish."; a pick sends nothing.
- Escape closes the menu and puts focus back on Refine.

## Failure-mode expectations

- A failed refine shows the error on the new version with "Try again"; the earlier version stays reachable with the pager.

## Cautions

- A refine never appends a new message; it adds a version to the existing reply and keeps the earlier answer.
- The preset is sent once, for that request only; it is never saved into the user's rules.
