# Options-audit-log entry-renders rubric

## Latency budgets

- Mount with seeded log -> first row visible: <= 300ms.

## State expectations

- Step 1: `egaAuditLog` carries at least one entry.
- Step 2: the audit-log panel mounts under Diagnostics; rows render newest-first.
- Step 3: each row shows timestamp + task + backend + outcome + latency.

## Visible affordances

- Outcome tone tokens differ for success / warning / danger (cache hit, fallback used, error).
- Timestamps are human-formatted relative ("5m ago") with absolute on hover.

## Failure-mode expectations

- Corrupted log entry (malformed shape) is skipped silently; the rest of the log renders.

## Cautions

- The list must virtualise above ~200 entries (typical log size). Below that, plain render is fine.
- Row content must not leak the request body — log entries store metadata, not user content.
