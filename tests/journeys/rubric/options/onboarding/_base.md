# Options-onboarding surface rubric

## Mount conditions

- Banner renders ONLY when no provider keys are configured AND `onboardingDismissed` is unset.
- Banner is the first row inside the active panel; it does not block the tablist.

## Dismiss

- Skip / Dismiss action sets `onboardingDismissed = true`; banner does not reappear on next mount.
- Dismiss is per-extension-install, not per-session.

## CTAs

- Backend-choice CTAs jump to the Backends tab and scroll-anchor the matching provider card.
- CTAs never silently configure a backend — the user lands on the card and fills the key themselves.

## A11y

- Banner has a role=region with a labeled heading.
