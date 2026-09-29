# Options-onboarding choose-gemini-jumps-to-backends rubric

## Latency budgets

- CTA click -> tab switch + scroll-anchor: <= 400ms.

## State expectations

- Step 1: onboarding banner is mounted with the Gemini CTA visible.
- Step 2 (click "Add Gemini"): the rail switches to the Backends tab; the Gemini card scroll-anchors into view.
- Step 3: the Gemini card's API-key field receives focus (or a transient highlight).

## Visible affordances

- The CTA uses the primary action tokens; carries provider iconography.
- Scroll-anchor lands the card below the sticky header — never under it.

## Failure-mode expectations

- The Backends tab is always available — there's no degraded-state where this jump fails.

## Cautions

- The jump must NOT auto-fill or auto-enable Gemini — the user lands on the card and configures explicitly.
- The banner stays mounted after the jump until the user configures a key — dismissing requires the explicit Skip path.
