# Settings-runtime-propagation backend-chain-edit-mid-stream rubric

## Latency budgets

- Backend reorder commit -> next request honors new chain: <= 200ms after commit.

## State expectations

- Step 1: a translate is in flight under chain [A, B, C].
- Step 2 (user reorders to [B, A, C] mid-stream): the in-flight request finishes under [A, B, C].
- Step 3: the NEXT translate (any surface) routes under [B, A, C].

## Visible affordances

- Reorder uses drag-and-drop OR up/down controls; commit happens on drop / button click.

## Failure-mode expectations

- Reorder of a backend currently serving the in-flight request does NOT cancel the stream — the running attempt completes.
- A reorder that disables the active backend has the same semantics — in-flight finishes; next request honors.

## Cautions

- Storage propagation via `chrome.storage.onChanged`; surfaces re-read on the next request without remount.
- The change must be visible in audit log of the next request as the new chain.
