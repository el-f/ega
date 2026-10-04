# Options-onboarding banner-dismissable rubric

## Latency budgets

- Dismiss click -> banner unmount: <= 150ms.
- Storage write: <= 200ms.

## State expectations

- Step 1: onboarding banner is mounted.
- Step 2 (click "Skip for now"): banner unmounts at once; `onboardingDismissed = true` writes to storage.
- Step 3 (next mount of Options): banner does NOT re-render.

## Visible affordances

- Dismiss control is a ghost button labeled "Skip for now", beside the Gemini CTA.

## Failure-mode expectations

- Storage write failure -> banner reappears at once (the hide is rolled back); the user can dismiss again.

## Cautions

- Dismiss is per-extension-install, not per-session.
- No onboarding-only reset exists; About > "Delete all data" brings it back but also wipes settings and keys.
