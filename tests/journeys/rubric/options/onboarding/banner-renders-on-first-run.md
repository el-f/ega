# Options-onboarding banner-renders-on-first-run rubric

## Latency budgets

- Options shell mount -> banner visible: <= 300ms.

## State expectations

- Step 1: no enabled backend is usable (no key, Ollama URL, reachable Ollama or native host) AND `onboardingDismissed` is not true.
- Step 2: Options shell mounts; the banner renders at the top of the active panel.
- Step 3: the banner carries a one-line body, one "Add a Gemini key" CTA, and a "Skip for now" button.

## Visible affordances

- Banner is informational: accent border and soft accent background, the same width as the tab content. It shows on the Translate and Backends tabs only.
- The Gemini CTA uses the accent tokens; "Skip for now" is a transparent ghost button.

## Failure-mode expectations

- Banner does NOT mount if any enabled backend has its key or Ollama URL, and hides once an enabled native host / Ollama daemon answers; a key on a disabled backend does not count.
- Banner does NOT mount if `onboardingDismissed === true`.

## Cautions

- The banner must NOT block the tablist; it shrinks the active panel slightly but the rail stays reachable.
- A flash-of-banner on storage read race is unacceptable — guard the gate with the settings-ready signal.
