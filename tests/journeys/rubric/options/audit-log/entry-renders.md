# Options-audit-log entry-renders rubric

## Latency budgets

- Mount with seeded log -> first row visible: <= 300ms.

## State expectations

- Step 1: `egaAuditLog` carries at least one entry.
- Step 2: the audit-log panel mounts under Diagnostics; rows render newest-first.
- Step 3: each row shows timestamp + task + backend + outcome + latency.

## Visible affordances

- Only cache hits and errors get a pill: `cache` in accent, `error` in danger; success rows have none.
- Timestamps are absolute, in the browser's locale format.

## Failure-mode expectations

- Corrupted log entry (malformed shape) is skipped silently; the rest of the log renders.

## Cautions

- The log keeps at most 50 entries, so the list is a plain render; no virtualization.
- Entries store prompt and response text clipped to 200 chars (1000 on error); the collapsed row shows only metadata.
