# Options family rubric

## Cross-surface invariants

- The Options shell is a tablist — keyboard nav (arrow / Home / End / Alt-digit) walks tabs. It opens on Translate unless another surface asked for a specific tab.
- Writes are debounced or commit-on-blur — no per-keystroke storage round-trip. Long-running writes show a subtle in-row "Saved" ack.
- Options top-right holds Search settings and a System/Light/Dark theme radiogroup. The active-backend chip is only on the popup and side panel.

## Settings semantics

- Modified-from-default rows surface a Reset affordance. Reset clears the row override and falls back to the spec-declared default.
- Settings-search jumps to the target tab AND scroll-anchors / focuses the matching row — search is a query, not a teleport.
- Audit log is append-only within a session; Clear is explicit and confirmed.

## Onboarding

- Banner only renders when no backend is usable (no enabled keyed/URL backend or local server, no detected native host or Ollama) AND the user has not dismissed it. Dismiss persists.
- Banner CTAs jump to the relevant tab — they never silently configure a backend.
