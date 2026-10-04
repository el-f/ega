# Options-onboarding choose-gemini-jumps-to-backends rubric

## Latency budgets

- CTA click -> tab switch + scroll-anchor: <= 400ms.

## State expectations

- Step 1: onboarding banner is mounted with the Gemini CTA visible.
- Step 2 (click "Add a Gemini key"): the rail switches to the Backends tab; the Gemini card opens and scrolls into view.
- Step 3: the Gemini card's API-key field receives focus (or a transient highlight).

## Visible affordances

- The CTA uses the accent tokens; it has no icon, only the label and a short signup subline.
- Scroll-anchor lands the card below the sticky header — never under it.

## Failure-mode expectations

- The Backends tab is always available — there's no degraded-state where this jump fails.

## Cautions

- The jump must NOT auto-fill or auto-enable Gemini — the user lands on the card and configures explicitly.
- The banner hides for this session after the jump (`onboardingDismissed` stays false); the "No backend configured" bar shows until an enabled backend becomes usable.
