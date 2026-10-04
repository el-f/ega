# Options-tasks version-banner-keep-mine rubric

## Latency budgets

- Banner action click -> storage write + banner dismiss: <= 200ms.

## State expectations

- Step 1: a version upgrade makes the built-in default diverge from the user's saved template; the version banner mounts.
- Step 2 (click "Keep mine"): `templateVersionAcknowledged` is set to the current default version in storage.
- Step 3: the banner dismisses; the user's `promptTemplate` body is unchanged.

## Visible affordances

- Banner carries three actions: "Keep mine", "Show diff", "Overwrite with new default".
- "Keep mine" is styled as a secondary action (not danger-toned — it's a safe choice).

## Failure-mode expectations

- If storage write for `templateVersionAcknowledged` fails, the banner stays visible rather than silently dismissing without acknowledgment.

## Cautions

- "Keep mine" must NOT alter `promptTemplate` — only sets the acknowledged version flag.
- After "Keep mine", the banner must not re-appear until the next default version bump.
