# Tooltip-sidepanel-escalation audit-entry-fans-out rubric

## Latency budgets

- Audit append -> visible across surfaces: <= 1s.

## State expectations

- Step 1: tooltip completes a translate; an entry appends to `egaAuditLog`.
- Step 2: the popup chip count updates within 1s; the sidepanel inline audit trace surfaces the entry; the Options Diagnostics panel includes it.
- Step 3: hovering any of the three surfaces shows the SAME entry detail (same task, same backend, same outcome).

## Visible affordances

- Popup chip uses a count badge.
- Sidepanel inline trace uses the audit log's tone tokens.
- Options panel renders the entry per the audit-log surface rubric.

## Failure-mode expectations

- A storage write failure on the audit append surfaces a warning toast on the writing surface; the entry is not silently dropped.

## Cautions

- Fan-out goes through the `chrome.storage.onChanged` event — surfaces must NOT poll.
- Each surface reads the same `egaAuditLog`; they do not maintain divergent copies.
