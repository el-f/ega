# Templates-editor describe-header-scoped-to-chip rubric

## Latency budgets

- Apply (LLM mock) -> rule added + rule visible: <= 500ms (mocked backend).

## State expectations

- Step 1: user is on the Reword chip in the templates workbench; a Describe/Refine row is visible in the header area.
- Step 2: user types a description and clicks Apply; the LLM returns a rule.
- Step 3: the new rule is added to storage with `scope.tasks = ['reword']` — scoped to the Reword task only.

## Visible affordances

- The Describe row in the workbench header is visually connected to the active chip scope.
- The resulting rule row in the rules editor shows the `reword` task scope chip.

## Failure-mode expectations

- A rule added via the Describe row in the Reword chip scope must NOT have an empty `scope.tasks` — the scope must always be set to the active chip's task.

## Cautions

- `scope.tasks = ['reword']` means the rule applies only when the user's active task is Reword.
- If the LLM response does not include scope information, the adapter must inject the chip's task scope — the user's intent is clear from the UI context.
