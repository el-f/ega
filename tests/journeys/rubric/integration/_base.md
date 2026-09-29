# Integration family rubric

## Cross-surface invariants

- Cross-surface handoffs go through declared channels (`pendingPopupHandoff`, `chrome.runtime` messages). Direct DOM coupling between surfaces is a bug.
- Audit log entries are visible to every surface — popup chip, sidepanel inline trace, Options Diagnostics panel. Clears fan out within 1s.
- Cache keys are identical regardless of source surface — a tooltip and a sidepanel translating the same text under the same settings MUST hit the cache.

## Settings propagation

- Live settings edits (backend chain, task temperature, rules, theme) apply to the NEXT request without remount of any mounted surface. Mid-stream edits never mutate the in-flight request — the running stream finishes under its original config.
- Storage migration runs on load; retired keys are stripped without UX-visible disruption.

## Failure modes

- Surfaces that lose their handoff payload (sidepanel cold-start without a fresh slot) mount clean — no stale prefill from a previous session.
- Stale payloads (>60s) are ignored; the receiving surface mounts in its default state.
