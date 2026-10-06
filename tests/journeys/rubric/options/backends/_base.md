# Options-backends surface rubric

## Mount + render

- The tab title "Backends" has an (i) "About backends" and one line "Where Ega sends text, tried from the top of the list".
- While no backend can run and the user has not skipped it, a "Get started" card comes first.
- "Backends in use" is a card: "Try up to [1|2|3|4] backends per request", then one row per backend in the order Ega tries them. "Not in use" is a second card with the rest.
- A collapsed row is one line: drag handle with its position (in-use rows only), chevron and name, "Text only" as plain muted text when it reads no images, one status pill (icon plus word), the route tag (First choice, Backup 1, Not reached, Skipped, Checking...), then a toolbar: Move up, Move down, Disable. Not-in-use rows end with Enable. No coloured dot; no box per row, only hairlines between rows.

## Persistence

- API-key edits write on every keystroke to the provider's key field, so a Test right after a paste uses the new key.
- Disable/Enable (or a drag between the two cards) updates `disabledBackends` at once.
- "Try up to N" writes `advanced.retryCount = N - 1`.

## Test now

- Test now re-probes, then translates a short phrase. A pass shows "Answered in 0.8 s", the answer, and the pill becomes "Verified" (kept across reloads for that key and model). A failure shows a plain title and one sentence; the backend's own message and code sit under "Details".

## Safety

- API keys are masked by default; the last test result stores no key text.
