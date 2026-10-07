# Tooltip-sidepanel-escalation surface rubric

## Escalation channel

- Tooltip surfaces "Continue in side panel" in the error state, "Pin to side panel" on a text success, and "Open in side panel" on an image success.
- The escalation handoff carries source text, source + target lang, task and tone. Pin adds the tooltip's explanation and the panel re-sends the text; Open in side panel adds the image and its result as a finished turn.

## Audit fan-out

- A tooltip translate adds one entry to `egaAuditLog`; the Options > Advanced > Diagnostics "Recent requests" card lists it within 1s. The side panel only toasts error entries from other surfaces; the popup shows no audit data.

## Cache parity

- Identical input under identical settings hits the cache on the second surface — tooltip first, sidepanel second (or vice versa). Cache misses across surfaces indicate a key mismatch bug.

## Cancellation

- The side panel's "Stop all requests" (header More menu) sends `translate:cancel-all`; the router aborts every tracked request, in-flight tooltip translates included.

## Settings live mutation

- A "Fallback backends" edit in Options (`advanced.retryCount`, 0-3) sets the NEXT tooltip request's backend chain length — mid-flight requests are not re-budgeted.
