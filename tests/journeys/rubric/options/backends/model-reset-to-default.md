# Options-backends model-reset-to-default rubric

## Latency budgets

- ResetField click -> storage write + field revert: <= 200ms.

## State expectations

- Step 1: user has changed the model for a cloud provider to a non-default value.
- Step 2: a ResetField arrow icon is visible next to the model select.
- Step 3 (click ResetField): the model select reverts to the provider's schema default; `settings.model[provider]` writes the default value; the ResetField icon hides.

## Visible affordances

- ResetField icon appears only when the current model differs from the provider default.
- After reset, the model select shows the default model id.

## Failure-mode expectations

- Storage write failure surfaces an inline error; model select retains the prior non-default value.

## Cautions

- ResetField sets the value to the provider's defined default, not to null/undefined — the model key is always present in storage.
- Resetting the model invalidates cache entries that were keyed on the prior model id; the cache digest re-computes on next dispatch.
