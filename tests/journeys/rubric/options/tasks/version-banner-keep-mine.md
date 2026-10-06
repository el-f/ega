# Options-tasks version-banner-keep-mine rubric

## Latency budgets

- "Keep mine" click -> storage write and notice gone: <= 200ms.

## State expectations

- Step 1: the user's edited Translate prompt is from an older version; the notice shows inside the Prompt section.
- Step 2 (click "Keep mine"): `templateVersionAcknowledged` is set to the current version.
- Step 3: the notice goes; the user's `promptTemplate` is unchanged.

## Visible affordances

- The notice has "Show changes", "Use the new prompt" and "Keep mine" (a ghost button: it is the safe choice).

## Failure-mode expectations

- A failed write leaves the notice in place and says so in the footer.

## Cautions

- "Keep mine" must NOT alter `promptTemplate`; the notice does not come back until the next version bump.
