# Tooltip-sidepanel-escalation tooltip-error-toast-bus rubric

## Latency budgets

- Tooltip error -> audit-log error append: <= 200ms.
- Audit append -> sidepanel Toaster mount: <= 500ms.

## State expectations

- Step 1: tooltip fails translation; an error chunk lands.
- Step 2: the audit log gets an error entry; the sidepanel (mounted or cold-starting on demand) surfaces a toast with the error reason.
- Step 3: toast carries a "Show details" affordance jumping to the sidepanel inline trace.

## Visible affordances

- Toast uses the danger tone tokens; auto-dismisses after a generous 8s (errors are higher-priority).
- Inline trace marks the failed entry visually.

## Failure-mode expectations

- Sidepanel not mounted -> the toast does NOT fire silently; the next sidepanel open mounts the toast from a queue.

## Cautions

- The Toaster bus must be a singleton — no duplicate toasts when both the tooltip and the sidepanel observe the same audit append.
- Toasts must be dismissable on click; the bus listens for dismissals.
