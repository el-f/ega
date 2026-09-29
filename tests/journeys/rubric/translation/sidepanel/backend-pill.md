# Sidepanel backend-pill rubric

## Latency budgets

- Pill render on mount: <= 100ms after settings load.
- Pill update on backend chain change: <= 200ms after storage write.

## State expectations

- Step 1: sidepanel header carries an active-backend pill displaying the head-of-chain provider name.
- Step 2 (click pill): a chain popover opens listing the configured fallback order in current rank.
- Step 3: changing the chain in options updates the pill within 200ms (no remount).

## Visible affordances

- Pill carries a small status-dot reflecting backend health where available; tokens, not raw colors.
- Popover is view-only — no input or reorder lives here; "Manage chain" link jumps to Options > Backends.

## Failure-mode expectations

- No backend configured -> pill shows "No backend" tone with a CTA to Options.
- Backend in temporary failure -> dot shifts to warning tone with a hover explanation.

## Cautions

- Pill must never block the composer / send button by occupying excess header width.
- Clicking the pill must NOT pin the panel into a backend-only mode — it remains a launcher into Options.
