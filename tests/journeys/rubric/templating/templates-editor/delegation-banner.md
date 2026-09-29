# Templates-editor delegation-banner rubric

## Latency budgets

- Chip switch to Translate/Explain -> banner render: <= 200ms.

## State expectations

- Step 1: user selects the Translate or Explain chip in the rail.
- Step 2: a delegation banner mounts above the editor explaining these tasks inherit the Global template by design.
- Step 3 (click "Jump to Global" CTA): chip rail switches to Global; banner dismisses.

## Visible affordances

- Banner uses the info tone tokens; carries a clear heading + body + primary CTA.
- Banner is dismissable per session (a small X) — re-opens on next entry to the surface.

## Failure-mode expectations

- Banner does NOT render on other task scopes (e.g., per-language, per-site overrides) — only Translate / Explain.

## Cautions

- The banner is informational, not a block — the user can still edit the Translate / Explain per-task body if they really want to.
- The CTA must scroll-anchor to the Global chip / textarea on jump.
