# Side panel reply translate-into rubric

## Latency budgets

- "Translate into…" -> language popover visible: <= 100ms.
- Translate click -> request fired: <= 100ms.

## State expectations

- Step 1: a reply's Refine menu offers "Translate into {composer target}" only when that language differs from the reply's, and always "Translate into another language…".
- Step 2 ("another language"): a small "Translate into" popover opens with a Language select that starts on the composer's target, and a Translate button that is always ready.
- Step 3 (Translate): the popover closes, the reply gets a new version in that language (pager 2/2), and version 1 keeps the earlier answer.
- Changing the composer's target language alone re-runs nothing.

## Visible affordances

- Picking a language in the select runs nothing; only the Translate button sends a request.
- Esc closes the popover and returns focus to Refine.

## Failure-mode expectations

- A failed version shows its error with "Try again"; the earlier answer stays on version 1.

## Cautions

- The new version answers the same message; no new message is appended.
