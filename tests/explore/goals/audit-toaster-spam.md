# Goal: audit-toaster-spam

You are exploring the ega Chrome extension. Your goal is to flood the
audit log with error entries faster than the sidepanel's Toaster can
dismiss them, then observe whether toasts queue, drop, or freeze the UI.

## Surfaces in scope

- sidepanel Toaster (svelte-sonner mount)
- audit log writer (`pushAuditEntry`) under error severity
- background router error propagation channel

## Hypotheses to test

1. Bursting 50 error translates in <1s mounts 50 simultaneous toasts;
   sonner's default visible limit is exceeded and the sidepanel main
   thread blocks on layout for >500ms.
2. Toaster's `dismiss-all` action does not clear queued-but-not-yet-
   visible toasts; closing the sidepanel mid-burst then reopening
   shows the backlog flushed all at once.
3. Audit error severity is debounced upstream but the toast channel
   isn't; UI shows N toasts while audit log records N-k entries.

## Done condition

You found an assertion that fails reliably and have produced a 5-12 step
recipe via your `assert` tool.
