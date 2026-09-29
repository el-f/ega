# Options family rubric

## Cross-surface invariants

- The Options shell is a tablist — keyboard nav (arrow / Home / End / Alt-digit) walks tabs. Active tab persists across reopens within a session.
- Writes are debounced or commit-on-blur — no per-keystroke storage round-trip. Long-running writes show a subtle in-row "Saved" ack.
- The active backend chip + theme cycle live in the top-right and behave identically across Options / popup / sidepanel.

## Settings semantics

- Modified-from-default rows surface a Reset affordance. Reset clears the row override and falls back to the spec-declared default.
- Settings-search jumps to the target tab AND scroll-anchors / focuses the matching row — search is a query, not a teleport.
- Audit log is append-only within a session; Clear is explicit and confirmed.

## Onboarding

- Banner only renders when no provider keys are configured AND the user has not dismissed it. Dismiss persists.
- Banner CTAs jump to the relevant tab — they never silently configure a backend.
