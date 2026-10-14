# Sidepanel refine-on-explain-turn rubric

## Latency budgets

- Preset pick after an explain reply -> new version's first token: warm <= 1.5s.

## State expectations

- Step 1: the user picks Explain in the "Next message" popover (chip "Explain → English") and sends; the Explain reply completes, with its notes block.
- Step 2: the reply's Refine menu offers Explain's presets ("Shorter", "Simpler"), then "Describe a change…".
- Step 3 (Shorter): the reply gains version 2; the request carries the explain prompt and the Shorter refinement; the new version explains the same message in a shorter form.

## Visible affordances

- While the version runs, the meta slot reads "Explaining…".
- The finished version names "Shorter" in its meta line.

## Failure-mode expectations

- A failed version shows its error with "Try again"; version 1 stays readable with the pager.

## Cautions

- The refine request must take the explain path on the wire — an explain refinement, not a translate one.
- The source for the refine is the message that drove the explain, not the explain answer.
