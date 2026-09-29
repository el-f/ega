# Per-preset-override clear-override rubric

## Latency budgets

- Clear click -> confirm + storage write: <= 300ms.

## State expectations

- Step 1: user has an active override for a preset; the editor shows the override body.
- Step 2 (click Clear / Reset): a confirm dialog surfaces naming the preset to be reset.
- Step 3 (confirm): the override entry is removed from storage; the editor reloads with the inherited default.

## Visible affordances

- The Clear / Reset button is disabled when no override exists for the preset.
- Confirm dialog uses warning tone tokens.

## Failure-mode expectations

- Cancel leaves the override untouched.
- Clearing on a preset that no longer exists in storage (race) is a no-op with no error.

## Cautions

- Clear removes the override only; the preset itself remains and continues to use the inherited template.
- The editor's textarea content must reload from inherited — not stay stale with the previous override body.
