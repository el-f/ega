# Snippets rename-collision rubric

## Latency budgets

- Submit with duplicate name -> inline error shown: <= 100ms.

## State expectations

- Step 1: two snippets "a" and "b" are seeded; user opens the rename dialog for snippet "a".
- Step 2: user types "b" (the name of the existing second snippet) into the name field.
- Step 3 (submit): a `validateName` inline error renders ("A snippet named 'b' already exists"); no storage write occurs; dialog stays open.

## Visible affordances

- Inline validation uses danger tone tokens.
- Submit button is disabled while the collision error is active.
- The error clears immediately when the user changes the name to a non-conflicting value.

## Failure-mode expectations

- The dialog must NOT close on a collision submit.
- `snippets` storage key remains unchanged after the blocked submit.

## Cautions

- Name comparison is case-sensitive; "B" and "b" are different names.
- The collision check must run against the current stored snippet names, not the in-memory list (in case another process added a snippet concurrently).
