# Tooltip-sidepanel-escalation audit-clear-syncs-across-surfaces rubric

## Latency budgets

- Options Clear confirm -> Options audit log shows its empty state: <= 1s.

## State expectations

- Step 1: audit log has multiple entries across surfaces.
- Step 2 (Options > Diagnostics > Clear audit log): user confirms; `egaAuditLog` empties in storage.
- Step 3: within 1s, the Options audit log shows the "No translations logged yet" empty state; the popup and side panel show no audit data.

## Visible affordances

- The Clear-audit action requires confirm; uses danger tone tokens.
- Surfaces observing the change use `chrome.storage.onChanged`, not polling.

## Failure-mode expectations

- A surface that fails to receive the change event (rare race) surfaces stale data; next user action re-reads and corrects.

## Cautions

- The clear must remove entries fully; do not leave placeholder entries (would confuse counts).
- The clear does NOT clear other settings — `sitePrefs`, `customLanguages`, etc., are independent.
