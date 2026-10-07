# Options-audit-log entry-renders rubric

## Latency budgets

- Mount with seeded log -> first row visible: <= 300ms.

## State expectations

- Step 1: `egaAuditLog` carries at least one entry.
- Step 2: the Recent requests card mounts under Diagnostics; rows render newest-first.
- Step 3: each row reads task name, backend name, time taken, status in words, relative time, then "Details".

## Visible affordances

- Status is a word, not a pill: "OK", "From cache", "Canceled", or the shared error title in the danger color.
- The relative time ("5m ago") carries the full date and time in its accessible name.
- No raw ids (`anthropic`, `TRANSLATE`) and no monospace timestamps on the row.

## Failure-mode expectations

- Corrupted log entry (malformed shape) is skipped silently; the rest of the log renders.

## Cautions

- The log keeps at most 50 entries, so the list is a plain render; no virtualization.
- Entries store prompt and response text clipped to 200 chars (1000 on error); the row shows only metadata until Details opens.
