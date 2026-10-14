# Settings-runtime-propagation rules-edit-propagates-to-sidepanel rubric

## Latency budgets

- Rule edit commit (Options) -> sidepanel next turn uses new rules: <= 500ms after commit.

## State expectations

- Step 1: sidepanel is mounted with conversation history; user edits a rule in Options.
- Step 2: storage commit fires; `chrome.storage.onChanged` propagates to the sidepanel.
- Step 3: the next user turn sent from the sidepanel ships a system prompt with the updated rules block.

## Visible affordances

- N/A — this is a request-shape contract.

## Failure-mode expectations

- A rule edit during an in-flight sidepanel stream does NOT alter the in-flight request; the running stream finishes under the prior rules.

## Cautions

- Rules render as an unnumbered bullet list, sorted least-specific first, then oldest `addedAt` first.
- Disabled rules, and rules scoped to another task or site, are omitted; the block holds only enabled rules that match the request.
