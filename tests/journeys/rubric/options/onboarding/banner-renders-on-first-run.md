# Options-onboarding banner-renders-on-first-run rubric

## Latency budgets

- Options shell mount -> notice visible: <= 300ms.

## State expectations

- Step 1: no enabled backend is usable AND `onboardingDismissed` is not true.
- Step 2: the Answers tab shows the one-line notice "No backend is set up yet, so Ega cannot translate" and a "Set up a backend" button.
- Step 3 (click "Set up a backend"): the Backends tab opens; the "Get started" card is under the tab title with "Use a free Gemini key" (primary), "Use another API key", "Run on this computer" and "Skip for now"; the notice is gone.

## Visible affordances

- The notice is amber, one line, with one secondary button.
- The card has one filled button (the Gemini one); the others are secondary or ghost.

## Failure-mode expectations

- Neither shows if any enabled backend has its key or Ollama URL, or an enabled native host / Ollama daemon answers; a key on a disabled backend does not count.
- The card does not show if `onboardingDismissed === true`.

## Cautions

- A flash of the notice while settings load is unacceptable — the gate waits for the settings.
