# Options-backends model-select rubric

## Latency budgets

- Selection change -> storage write: <= 200ms.

## State expectations

- Step 1: user opens the model select for a provider.
- Step 2 (choose a model): `settings.model[provider]` writes to storage.
- Step 3: no "Saved" ack shows; the value saves as typed, and later requests use the new model.

## Visible affordances

- Model select is a combobox with provider-specific options.
- Each option shows the model id only; the selected one carries a check mark.

## Failure-mode expectations

- An unknown model id is kept as typed, with no warning or fallback; the provider rejects it at request time.
- Storage write failure shows a "Change not saved" warning toast; storage keeps the previous value.

## Cautions

- The model select must NOT trigger a backend probe; the user picks based on labels, not on live availability.
- Switching models flushes the whole translation cache (any settings change except sitePrefs/theme does).
