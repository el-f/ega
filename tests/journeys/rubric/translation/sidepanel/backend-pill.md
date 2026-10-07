# Sidepanel backend-pill rubric

## Latency budgets

- Chip render on mount: <= 100ms after settings load.
- Chip update on backend chain change: <= 200ms after storage write.

## State expectations

- Step 1: the header carries the backend status chip: a dot plus the name of the first ready backend in the chain ("Anthropic"). The name is never cut to "A…": under 360px the chip becomes a dot-only button with the same accessible name.
- Step 2 (click the chip): the "Backends" popover opens with each backend's plain status (In use, Ready, Needs a key, Not running, Can't connect, Checking…), "Ega tries them in this order." and "Manage backends".
- Step 3: changing the chain in Options updates the chip within 200ms (no remount).

## Visible affordances

- The chip's name is "{Backend} is ready. Show backends"; the dot is never the only cue.
- A row that needs work has its own fix link ("Add key", "How to start", "Check settings").

## Failure-mode expectations

- No backend set up -> the chip reads "Set up backend" (never collapses) and opens Options > Backends.
- An unreachable backend -> its popover row says why; the chip itself keeps the next ready backend.

## Cautions

- The chip must never push other header controls onto a second row.
- Clicking the chip must not switch backends; it only shows them.
