# Options-onboarding surface rubric

## Mount conditions

- "No backend can run" means no enabled backend is usable (no key, no Ollama URL, no enabled local server, no reachable native host or Ollama daemon).
- While no backend can run, every tab shows ONE notice under the header: "No backend is set up yet, so Ega cannot translate" with a secondary "Set up a backend" button.
- On the Backends tab the notice is replaced by the "Get started" card, until the user presses "Skip for now". The page never shows the notice and the card together.

## Dismiss

- "Skip for now" sets `onboardingDismissed = true`; the card does not come back on the next mount.
- After Skip, the notice shows on every tab, the Backends tab included, without its button there.

## Actions

- "Use a free Gemini key" opens the Gemini row and focuses its key field.
- "Use another API key" scrolls to the "Not in use" list.
- "Run on this computer" opens the Ollama row.
- No action configures a backend by itself; the user fills the key or the address.

## A11y

- The card is a SectionCard: an h2 "Get started" with one description line, then one row of buttons.
