# Templating family rubric

## Cross-surface invariants

- Saves are explicit — no auto-persist on every keystroke for templates and rules. Snippets are the exception (per-keystroke draft).
- Reset semantics are uniform: reset clears the user-scoped override, falling back to the inherited (global / built-in) body. Reset never deletes user-authored rules.
- Compiled previews reflect the resolved system + user prompt that the backend would actually receive — no marketing-render rewrite.

## Delegation

- Translate and Explain tasks share a Global template by design — per-task overrides on these tasks surface a delegation banner with a one-click jump to the Global editor.

## Rules

- Rules are ordered, stable, additive blocks composed into the system prompt. Disabling a rule removes it from the next request without renumbering.
- Empty rules list surfaces an actionable empty state (Pick a recipe), not a blank panel.

## Recipes

- Recipes are bundled and read-only. Apply offers two modes: rules-only (additive) and full (overwrites template + appends rules).
- Full-apply is destructive enough to warrant a confirm step.
