# Options-onboarding banner-dismissable rubric

## Latency budgets

- Dismiss click -> card unmount: <= 150ms.
- Storage write: <= 200ms.

## State expectations

- Step 1: the Get started card is mounted on the Backends tab.
- Step 2 (click "Skip for now"): the card unmounts at once; `onboardingDismissed = true` writes to storage.
- Step 3: the notice shows on the Backends tab, without its "Set up a backend" button.

## Visible affordances

- "Skip for now" is a ghost button at the end of the card's action row.

## Failure-mode expectations

- Storage write failure -> the card comes back at once (the hide is rolled back); the user can skip again.

## Cautions

- Skip is per install, not per session.
