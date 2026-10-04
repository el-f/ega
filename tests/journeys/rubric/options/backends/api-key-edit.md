# Options-backends api-key-edit rubric

## Latency budgets

- Blur on key field -> storage write: <= 300ms.

## State expectations

- Step 1: user enters / pastes their Anthropic API key.
- Step 2: the value persists to `anthropicApiKey` once, on blur or Enter; typing alone writes nothing. The field stays masked unless the user revealed it.
- Step 3: a "Key saved." status line appears under the field once storage holds the new key; `apiKeyEditedAt[provider]` updates. The card pill reads "Key saved" until Test now passes.

## Visible affordances

- Key field is `type="password"` by default; reveal toggle (eye icon) flips to text temporarily.
- An "Edited Xd ago" line surfaces under the field for hygiene.

## Failure-mode expectations

- Clearing the key and leaving the field writes the empty value and says "Key removed."; `apiKeyEditedAt` does not update.

## Cautions

- The key must NEVER appear in console logs, request logs, or audit entries.
- Reveal must be per-card and never persist as visible across page reloads.
