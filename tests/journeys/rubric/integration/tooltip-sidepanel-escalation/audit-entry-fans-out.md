# Tooltip-sidepanel-escalation audit-entry-fans-out rubric

## Latency budgets

- Audit append -> visible across surfaces: <= 1s.

## State expectations

- Step 1: tooltip completes a translate; an entry appends to `egaAuditLog`.
- Step 2: within 1s the Options > Advanced > Diagnostics "Recent requests" card lists the entry; the popup and side panel do not show success entries.
- Step 3: the Options row shows the entry's time, task, backend and latency (plus a cache or error pill); clicking the time or latency expands the detail, clicking task or backend filters by it.

## Visible affordances

- The side panel shows a danger toast only for an error entry from another surface (never for its own requests or success entries).
- Options panel renders the entry per the audit-log surface rubric.

## Failure-mode expectations

- A storage write failure on the audit append shows no toast; the service worker re-queues the rows for the next write and drops the error with no log line for the tooltip's own push — only a content-script push relayed as an `audit:push` message gets a debug-level log.

## Cautions

- Options re-reads on `chrome.storage.onChanged`; the side panel gets error entries as an `audit:append` runtime message. Neither polls.
- Each surface reads the same `egaAuditLog`; they do not maintain divergent copies.
