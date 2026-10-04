# Sidepanel backend-pill rubric

## Latency budgets

- Pill render on mount: <= 100ms after settings load.
- Pill update on backend chain change: <= 200ms after storage write.

## State expectations

- Step 1: sidepanel header carries an active-backend chip naming the first ready backend in the translate chain, with its model after a dot.
- Step 2 (click pill): a chain popover opens listing the configured fallback order in current rank.
- Step 3: changing the chain in options updates the pill within 200ms (no remount).

## Visible affordances

- Pill carries a CPU icon, no status dot; health dots and badges live on the popover's chain rows.
- Popover ("Fallback order") is view-only — no input or reorder lives here; a "Manage backends" icon button in its footer jumps to Options > Backends.

## Failure-mode expectations

- No backend configured -> pill shows "No backend" tone with a CTA to Options.
- Unreachable backend -> its popover row shows an "error" or "not running" badge; the pill itself has no failure tone.

## Cautions

- Pill must never block the composer / send button by occupying excess header width.
- Clicking the pill must NOT pin the panel into a backend-only mode — it opens the fallback-order popover (or Options > Backends when no backend is set up).
