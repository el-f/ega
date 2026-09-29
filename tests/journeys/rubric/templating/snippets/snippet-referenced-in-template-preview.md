# Snippets snippet-referenced-in-template-preview rubric

## Latency budgets

- Snippet seed + `@@greeting@@` in sys template -> preview resolves: <= 200ms.

## State expectations

- Step 1: snippet "greeting" with body "Hello" is seeded in storage.
- Step 2: user adds `@@greeting@@` to the system template textarea.
- Step 3: the compiled preview renders "Hello" in place of `@@greeting@@` — the snippet is resolved.

## Visible affordances

- The compiled preview panel reflects the resolved snippet content as it would appear in the actual system prompt sent to the backend.
- The unresolved token `@@greeting@@` is not visible in the compiled preview when the snippet exists.

## Failure-mode expectations

- If the snippet `greeting` does not exist in storage, the compiled preview renders `@@greeting@@` verbatim with a warning marker ("Undefined snippet: greeting").

## Cautions

- Snippet resolution uses the `resolveSnippets` function on the compiled preview path — verify the same function used in the actual build-prompt path.
- Snippet names are case-sensitive; `@@Greeting@@` and `@@greeting@@` are different.
