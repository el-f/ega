# Conversation per-origin-persistence rubric

## Latency budgets

- Panel reload with stored thread: turns visible <= 300ms after mount.
- Storage write on pagehide: completes within the 10s Chrome unload budget.

## State expectations

- Step 1: send a turn and flush (or pagehide) — turns written to storage under the tab origin key.
- Step 2: reload the panel — turns restored from storage; no flicker or empty-then-fill visible to user.
- Step 3: new-conversation — storage key cleared; panel shows empty composer.

## Visible affordances

- After reload, restored turns are indistinguishable from freshly dispatched ones (same layout, chips, copy controls).
- new-conversation clears the composer placeholder copy and disables retry.

## Failure-mode expectations

- Storage quota exceeded -> graceful write failure; existing turns still shown in memory, storage not corrupted.
- Origin mismatch (panel opened on a different tab) -> thread for the new origin loads; prior origin's turns are NOT shown.

## Cautions

- Per-origin key isolation: tab A's turns must never appear under tab B's origin key.
- Concurrent origin switches must serialize; the last-resolved switch wins.
