# Options-onboarding surface rubric

## Mount conditions

- Banner renders ONLY when no enabled backend is usable (no key, no Ollama URL, no enabled local server, no reachable native host or Ollama daemon) AND `onboardingDismissed` is not true.
- Banner is the first row inside the active panel; it does not block the tablist.

## Dismiss

- The "Skip for now" button sets `onboardingDismissed = true`; banner does not reappear on next mount.
- Dismiss is per-extension-install, not per-session.

## CTAs

- The one backend CTA (Gemini) jumps to the Backends tab, opens the Gemini card, scrolls it into view and focuses its key field.
- CTAs never silently configure a backend — the user lands on the card and fills the key themselves.

## A11y

- Banner is a role=region with aria-label "Get started with Ega"; it has no visible heading.
