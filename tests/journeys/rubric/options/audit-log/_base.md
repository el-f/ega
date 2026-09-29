# Options-audit-log surface rubric

## Mount + render

- Surface lists `egaAuditLog` entries newest-first; each row carries timestamp + task + backend + outcome + latency.
- Empty state names what the audit log captures and links to Privacy.

## Filter

- Task filter chip narrows the list to entries matching the chosen task; match count is surfaced next to the filter.
- Filter chips are mutually exclusive; clearing the filter restores the full list.

## Export

- Export-as-JSON triggers a single download; filename includes date.
- Export reflects the currently filtered list, NOT the full log — the visible filter is the export contract.

## Clear

- Clear is confirmed (destructive). Once confirmed, the log empties and fan-out across surfaces happens within 1s.
