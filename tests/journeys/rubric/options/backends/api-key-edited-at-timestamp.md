# Options-backends api-key-edited-at-timestamp rubric

## Latency budgets

- Blur after new key value -> storage write + "Edited just now" line visible: <= 300ms.

## State expectations

- Step 1: user expands a cloud provider card; the API key field is visible.
- Step 2: user pastes or types a new API key; field blurs.
- Step 3: `apiKeyEditedAt[provider]` is written to storage with the current timestamp; an "Edited just now" hygiene line appears under the key field.

## Visible affordances

- The hygiene line uses muted body text: "Edited just now" (recency wording updates over time: "Edited 1d ago", "Edited 3d ago").
- A "Rotate key →" link sits next to the text to prompt periodic key hygiene.

## Failure-mode expectations

- Editing the key to an empty value (clear and blur): no timestamp write; hygiene line stays at the prior edit time (or is absent if never set).
- Storage write failure surfaces an inline error; timestamp and hygiene line are not shown.

## Cautions

- The timestamp records when the user last EDITED the key, not when it was created or last validated.
- The hygiene line must NOT show the key value or a partial key — it is metadata only.
