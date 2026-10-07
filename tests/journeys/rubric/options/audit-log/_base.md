# Options-audit-log surface rubric

## Mount + render

- The card is titled "Recent requests" with the line "The last 50 requests, kept on this computer"; the (i) "About this list" says nothing here is synced and that Clear and Delete all data remove it.
- Rows list `egaAuditLog` entries newest-first, in words: task name (not an id), backend name (not an id), time taken, status ("OK", "From cache", "Canceled", or the shared error title such as "API key rejected"), and a relative time whose full date is in the accessible name. A "Details" text button ends each row.
- Details opens the row in place with model, languages, tokens ("N in · M out"), the raw error code under "Technical", and the System / User / Response panels. Below the list, "Tokens in this list" sums every kept row. Cache hits and failures carry no tokens.
- Empty: one EmptyState "No requests yet" / "Requests show here after you translate"; no filters, and no Export or Clear in the header.

## Filter

- One filter row: Status (All, OK, Errors, From cache), Task, Backend (names; "Ega (no backend)" for a row no backend answered), and "Search requests". There are no preset chips.
- With filters on, the line above the list reads "N matches" with a ghost "Clear filters". Filtered to nothing: "No request matches these filters" with "Clear filters".

## Export

- "Export" (secondary, in the card header) triggers a single download; filename includes date.
- Export always writes the full log, whatever filters are active.

## Clear

- "Clear" (secondary, in the card header) asks "Clear recent requests?" first, because there is no Undo for it yet. Once confirmed, the log empties and the list shows the empty state.
