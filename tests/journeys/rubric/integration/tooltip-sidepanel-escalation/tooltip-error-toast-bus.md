# Tooltip-sidepanel-escalation tooltip-error-toast-bus rubric

## Latency budgets

- Tooltip error -> audit-log error append: <= 200ms.
- Audit append -> sidepanel Toaster mount: <= 500ms.

## State expectations

- Step 1: tooltip fails translation; an error chunk lands.
- Step 2: the audit entry is broadcast as `audit:append`; a mounted sidepanel shows a danger toast "On the page — <error>".
- Step 3: the toast carries an "Open settings" action when the error maps to a settings tab; otherwise no action.

## Visible affordances

- Toast uses the danger tone tokens; an error stays until the user dismisses it or starts another Ega action.

## Failure-mode expectations

- Sidepanel not mounted -> no toast; the broadcast is best-effort and nothing is queued.

## Cautions

- The Toaster bus must be a singleton — no duplicate toasts when both the tooltip and the sidepanel observe the same audit append.
- Toasts must be dismissable on click; the bus listens for dismissals.
