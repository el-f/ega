# Describe-change request-shape-meta-prompt rubric

## Latency budgets

- N/A — this is a request-shape contract.

## State expectations

- Step 1: user submits a description.
- Step 2: the outbound request carries the meta-prompt envelope (system + user prompt that instructs the model to return JSON-shaped rule output).
- Step 3: the meta-prompt body is stable across surfaces — the same envelope ships whether the user is in Options or the rules-editor.

## Visible affordances

- N/A — this is a request-shape contract; verified via `assertRequestShape` in flow.

## Failure-mode expectations

- A missing meta-prompt section in the outbound body is a major regression — the backend would not know to return JSON.

## Cautions

- The meta-prompt envelope must NOT include the user's freeform description verbatim in the system prompt — only as the user message.
- Backend-specific prompt augmentations (e.g., Claude's JSON-mode flag) are handled at the adapter layer, not in this envelope.
