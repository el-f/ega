# Picker sensitive-target-rejected rubric

## Latency budgets

- Click on sensitive target -> rejection feedback: <= 200ms.

## State expectations

- Step 1: picker overlay is mounted; user clicks a password input / hidden input / aria-hidden region.
- Step 2: the click is discarded; the picker stays mounted; the user can pick again.
- Step 3: a subtle inline notice surfaces ("Can't pick this element") with the reason; no toast, no overlay re-mount.

## Visible affordances

- Sensitive targets are visually marked with a distinct outline tone during hover (per `hover-outlines-target`).

## Failure-mode expectations

- A new clicker tab / element that becomes sensitive only on click (e.g., a button that focuses a password field) is treated as ineligible at click-time.

## Cautions

- Password inputs are NEVER captured. Even if the user "wants" to translate the field label, the value side is off-limits.
- The reason notice must NOT expose any element data (no `<input type=password id=mySecret>` leak).
