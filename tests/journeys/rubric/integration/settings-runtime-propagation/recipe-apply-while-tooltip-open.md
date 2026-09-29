# Settings-runtime-propagation recipe-apply-while-tooltip-open rubric

## Latency budgets

- Recipe apply (Options) -> tooltip next retry uses new rules: <= 500ms after commit.

## State expectations

- Step 1: tooltip is mounted with a result; user navigates to Options and applies a recipe that appends rules.
- Step 2: storage write completes; the `chrome.storage.onChanged` fires.
- Step 3: the next retry on the mounted tooltip uses the new rules in its system prompt — no remount required.

## Visible affordances

- The tooltip does NOT visually flicker on the rules update — it just uses them on the next request.

## Failure-mode expectations

- A storage write that fails to fire `onChanged` (rare) leaves the tooltip stale; the user must remount.

## Cautions

- The tooltip's settings re-read happens at request-build time, not on mount — guard against the closure-over-stale-settings regression.
- Rules added via recipe must NOT be merged with prior rules in a destructive way; appended only.
