# Options-onboarding banner-renders-on-first-run rubric

## Latency budgets

- Options shell mount -> banner visible: <= 300ms.

## State expectations

- Step 1: no provider keys are configured AND `onboardingDismissed` is unset.
- Step 2: Options shell mounts; the banner renders at the top of the active panel.
- Step 3: the banner carries a heading + body + provider-choice CTAs + a Skip / Dismiss affordance.

## Visible affordances

- Banner uses the info tone tokens; layout matches other Options banners.
- CTAs use the primary action tokens.

## Failure-mode expectations

- Banner does NOT mount if any key is configured (even on a non-active backend) — the user has clearly set things up.
- Banner does NOT mount if `onboardingDismissed === true`.

## Cautions

- The banner must NOT block the tablist; it shrinks the active panel slightly but the rail stays reachable.
- A flash-of-banner on storage read race is unacceptable — guard the gate with the settings-ready signal.
