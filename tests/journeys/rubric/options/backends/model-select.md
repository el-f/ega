# Options-backends model-select rubric

## Latency budgets

- Selection change -> storage write: <= 200ms.

## State expectations

- Step 1: user opens the model select for a provider.
- Step 2 (choose a model): `settings.model[provider]` writes to storage.
- Step 3: a subtle "Saved" ack flashes; subsequent requests use the new model.

## Visible affordances

- Model select is a combobox with provider-specific options.
- Each option carries the model id + a short summary (context window, tier).

## Failure-mode expectations

- An invalid / deprecated model id (planted by import) surfaces a warning + fallback to provider default.
- Storage write failure surfaces an inline error; previous value retained.

## Cautions

- The model select must NOT trigger a backend probe; the user picks based on labels, not on live availability.
- Switching models invalidates cache entries that depend on the model id (per cache-key contract).
