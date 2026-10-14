# Tooltip-sidepanel-escalation escalation-then-copy rubric

## Latency budgets

- Copy button click -> clipboard ack: <= 200ms.

## State expectations

- Step 1: tooltip translate (with its explanation) completes; user clicks Pin; the side panel re-sends the source text as a new UserTurn and streams a new AssistantTurn that keeps the explanation.
- Step 2: the AssistantTurn finishes with the translation as its body and the explanation in a "Context & subtext" block.
- Step 3 (click "Copy reply"): clipboard receives the reply text (the translation); the button flips to "Copied".

## Visible affordances

- Copy button is present on the seeded AssistantTurn (same position as on a normally-sent turn).
- Button shows a transient "Copied" state for ~1.5s then resets.

## Failure-mode expectations

- Clipboard write failure -> no "Copied" state; the error is only logged (no inline error).

## Cautions

- The copied text must be the assistant reply (the translation), not the source selection or the explanation.
- Copy must NOT trigger a re-stream or any backend request.
- The seeded turn's copy button must not differ in behavior from a copy button on any other sidepanel AssistantTurn.
