# Settings-runtime-propagation quota-exceeded-write-fails-loudly rubric

## Latency budgets

- Rejected write -> `settings:update` ack: <= 500ms.

## State expectations

- Step 1: `chrome.storage.local.set` rejects with a QUOTA_BYTES error inside the service worker.
- Step 2: the `settings:update` ack is `{ ok: false, reason: 'quota' }`; nothing of the patch is saved.

## Visible affordances

- The popup and side panel show the shared quota message on this ack: "Storage is full, so the change was not saved. Start a new conversation in the side panel to free space." Content-script writes show nothing; at most they log it.

## Failure-mode expectations

- A write error that is not about quota comes back as `reason: 'unknown'`, never as quota.
- The service worker keeps running; the next write succeeds once storage has room.

## Cautions

- There is no warning before a settings write fails: settings react only to a write the browser rejects. (The side panel's "Storage is nearly full" toast is about conversations, and it fires only after a conversation save was rejected.)
