# Tooltip explain-label rubric

## Latency budgets

- Explain trigger -> header label flip: <= 100ms.
- Explain first token visible: warm <= 1.5s, cold <= 4s.

## State expectations

- Step 1: tooltip shows "Translating..." (or finalized translation) header.
- Step 2 (Explain action): header copy flips to "Explaining..." with a streaming indicator; the body content area is cleared or replaced.
- Step 3: explanation tokens stream into the body; header returns to a finalized label on stream end.

## Visible affordances

- The Explain action is a distinct chip in the topbar; disabled while a translate is in flight.
- Header label uses present-continuous ("Explaining..." not "Explain") consistent with copy-consistency rule.

## Failure-mode expectations

- Explain failure surfaces an inline error pill with retry; the original translation is preserved beneath / restored.

## Cautions

- The Explain chip is HIDDEN on image-translate tooltips (`imageUrl` set) — image surfaces don't host follow-up explain chains.
