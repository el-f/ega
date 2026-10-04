# Translation family rubric

## Cross-surface invariants

- Target-language picker honors the user's persisted default; no silent reset.
- Direction-swap (LTR -> RTL or RTL -> LTR) does not reflow the input text in place.
- Retry after error preserves the last input verbatim — never drop or truncate.
- Streamed output renders incrementally; the user sees tokens land, not a wall of text after a long pause.

## Routing

- The user-facing surface (tooltip / sidepanel / popup) makes the same backend call shape; the routing chain is invisible to the user except via the active-backend chip.
- A backend fallback should surface as a single composed result with a quiet indicator of which backend served — never as a flash of "Backend A failed" then "Backend B succeeded".

## Confidence + tone

- Tooltip confidence pill uses success / warning / danger tokens (>=80% / >=60% / lower); the side panel shows a neutral "N% confident" pill. Light theme and the dark success/warning pills clear 4.5:1 contrast; the dark danger pill (<60%) does not (~3.6:1, uses --color-danger instead of the AA-safe --color-danger-fg).
- Tone selector retains its value across re-opens of the same surface in a session.
