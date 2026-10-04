# Options-onboarding banner-renders-on-first-run rubric

## Latency budgets

- Options shell mount -> banner visible: <= 300ms.

## State expectations

- Step 1: no enabled backend is usable (no key, Ollama URL, reachable Ollama or native host) AND `onboardingDismissed` is not true.
- Step 2: Options shell mounts; the banner renders at the top of the active panel.
- Step 3: the banner carries a one-line body, one "Add a Gemini key" CTA, and an "Advanced / skip" button.

## Visible affordances

- Banner uses the warning tone tokens (warning border, deep warning bg, warning fg).
- The Gemini CTA uses the accent tokens; "Advanced / skip" is a transparent ghost button.

## Failure-mode expectations

- Banner does NOT mount if any enabled backend has its key or Ollama URL, and hides once an enabled native host / Ollama daemon answers; a key on a disabled backend does not count.
- Banner does NOT mount if `onboardingDismissed === true`.

## Cautions

- The banner must NOT block the tablist; it shrinks the active panel slightly but the rail stays reachable.
- A flash-of-banner on storage read race is unacceptable — guard the gate with the settings-ready signal.
