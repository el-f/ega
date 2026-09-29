# Rules-editor describe-change-in-rules-tab rubric

## Latency budgets

- Apply (LLM mock) -> rule added to list: <= 500ms.

## State expectations

- Step 1: rules tab shows the embedded DescribeYourChange component with `task=global`.
- Step 2: user types a description and clicks Apply; the mocked LLM returns a rule.
- Step 3: the new rule appears in the rules list with `scope.tasks = []` (global scope — no task restriction).

## Visible affordances

- The DescribeYourChange row in the rules tab is visually integrated (not a separate dialog).
- The resulting rule row appears at the bottom of the list with all standard rule controls.

## Failure-mode expectations

- LLM error triggers the fallback path (heuristic rule from user input); the fallback rule still has `scope.tasks = []`.
- While Apply is in flight, a second Apply click is a no-op.

## Cautions

- `scope.tasks = []` is correct for the global context — the rules tab is not scoped to any specific task.
- The DescribeYourChange component in the rules tab uses the same backend path as the standalone describe-change surface.
