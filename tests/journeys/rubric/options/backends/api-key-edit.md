# Options-backends api-key-edit rubric

## Latency budgets

- Blur on key field -> storage write: <= 300ms.

## State expectations

- Step 1: user enters / pastes their Anthropic API key.
- Step 2: each keystroke persists the value to `anthropicApiKey` in storage; the field stays masked unless the user revealed it.
- Step 3: no "Saved" ack; `apiKeyEditedAt[provider]` updates and an "Edited just now" line appears under the field.

## Visible affordances

- Key field is `type="password"` by default; reveal toggle (eye icon) flips to text temporarily.
- An "Edited Xd ago" line surfaces under the field for hygiene.

## Failure-mode expectations

- Clearing the key writes the empty value (key removed); `apiKeyEditedAt` does not update.

## Cautions

- The key must NEVER appear in console logs, request logs, or audit entries.
- Reveal must be per-card and never persist as visible across page reloads.
