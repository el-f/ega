# Recipes-gallery apply-rules-only rubric

## Latency budgets

- Apply click -> rules appended to storage: <= 200ms.
- Toast feedback visible: <= 300ms.

## State expectations

- Step 1: user clicks "Use rules only" on a recipe card.
- Step 2: the recipe's rules append to `rules` in storage; existing rules are untouched.
- Step 3: a confirmation toast surfaces ("Added N rules from <recipe>").

## Visible affordances

- The action is a secondary button on each card; primary is the full Apply.
- Toast carries a "View rules" CTA that jumps to the rules editor.

## Failure-mode expectations

- A rule duplicate (same body) is detected and the duplicate insert is skipped; toast names the count actually added.

## Cautions

- Rules-only apply must NOT touch templates — that's the full-apply path.
- The recipe's rule order is preserved when appending — concatenation, not interleave.
