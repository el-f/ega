# Options-audit-log surface rubric

## Mount + render

- Surface lists `egaAuditLog` entries newest-first; each row carries timestamp + task + backend + outcome + latency.
- A row whose backend reported tokens shows "N in · M out"; above the filters, "Total tokens in the log" sums every kept row. Cache hits and failures carry no tokens.
- Empty state ("No translations logged yet") says what the log captures; it has no link.

## Filter

- Task select narrows the list to entries of that task; the header shows "N matches" beside the entry count.
- Filter chips are mutually exclusive; clearing the filter restores the full list.

## Export

- Export-as-JSON triggers a single download; filename includes date.
- Export always writes the full log, whatever filters are active.

## Clear

- Clear is confirmed in a danger dialog. Once confirmed, the log empties and the list shows the empty state.
