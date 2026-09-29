# Options-backends api-key-edit rubric

## Latency budgets

- Blur on key field -> storage write: <= 300ms.

## State expectations

- Step 1: user enters / pastes their Anthropic API key.
- Step 2 (blur): the key persists to `anthropicApiKey` in storage; the field switches to masked state.
- Step 3: a subtle "Saved" ack flashes; the `apiKeyEditedAt[provider]` timestamp updates.

## Visible affordances

- Key field is `type="password"` by default; reveal toggle (eye icon) flips to text temporarily.
- An "Edited Xd ago" line surfaces under the field for hygiene.

## Failure-mode expectations

- Empty key on blur -> field stays empty; no write.
- Malformed key (heuristic check on prefix) surfaces a soft warning, not a hard block.

## Cautions

- The key must NEVER appear in console logs, request logs, or audit entries.
- Reveal must be per-card and never persist as visible across page reloads.
