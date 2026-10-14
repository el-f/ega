# Options-onboarding choose-gemini-jumps-to-backends rubric

## Latency budgets

- Button click -> row open and key field focused: <= 400ms.

## State expectations

- Step 1: the Get started card is on the Backends tab with "Use a free Gemini key".
- Step 2 (click it): the Gemini row opens and scrolls into view.
- Step 3: the Gemini API key field has focus.

## Visible affordances

- The Gemini button is the card's one filled button.
- The row lands below the sticky header — never under it.

## Cautions

- The jump must NOT fill or enable Gemini — the user types the key.
- The card hides for this session after the jump (`onboardingDismissed` stays false); the notice shows until an enabled backend becomes usable.
