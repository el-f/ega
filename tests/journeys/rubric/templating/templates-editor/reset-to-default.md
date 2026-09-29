# Templates-editor reset-to-default rubric

## Latency budgets

- Reset click -> editor body restored: <= 200ms.

## State expectations

- Step 1: editor shows a user-overridden template body.
- Step 2 (click Reset): a confirm dialog appears naming what will be discarded.
- Step 3 (confirm): the override entry is removed from storage; the editor reloads with the inherited body.

## Visible affordances

- Reset button is disabled when no override exists.
- The confirm dialog names the scope being reset ("Reset Translate template?").

## Failure-mode expectations

- Reset on a scope with no override (defensive case) is a no-op with no confirm.

## Cautions

- Reset clears the override only; it does NOT delete user-authored rules or snippets.
- The inherited body is the spec-declared default OR the parent scope (Global for per-task overrides).
