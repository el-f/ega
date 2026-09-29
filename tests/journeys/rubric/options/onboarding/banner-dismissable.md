# Options-onboarding banner-dismissable rubric

## Latency budgets

- Dismiss click -> banner unmount: <= 150ms.
- Storage write: <= 200ms.

## State expectations

- Step 1: onboarding banner is mounted.
- Step 2 (click Skip / Dismiss): `onboardingDismissed = true` writes to storage; banner unmounts.
- Step 3 (next mount of Options): banner does NOT re-render.

## Visible affordances

- Dismiss control is a small X / "Skip" link; positioned consistent with other dismissible banners.

## Failure-mode expectations

- Storage write failure -> banner re-mounts on next page load (this is intentional; the user can dismiss again).

## Cautions

- Dismiss is per-extension-install, not per-session.
- Reset is possible via a hidden Options control or storage clear — the user is not stuck if they want the onboarding back.
