# Tooltip-sidepanel-escalation escalation-then-copy rubric

## Latency budgets

- Copy button click -> clipboard ack: <= 200ms.

## State expectations

- Step 1: tooltip explain completes; Pin seeds sidepanel with the explain UserTurn + AssistantTurn.
- Step 2: the seeded AssistantTurn is fully visible with its explain body.
- Step 3 (click copy on the seeded turn): clipboard receives the explain body text; a brief feedback indicator appears on the button.

## Visible affordances

- Copy button is present on the seeded AssistantTurn (same position as on a normally-sent turn).
- Button shows a transient "Copied" state for ~1.5s then resets.

## Failure-mode expectations

- Clipboard permission denied -> inline error near the button; no silent failure.

## Cautions

- The copied text must be the rendered explain body, not the source selection or tooltip raw text.
- Copy must NOT trigger a re-stream or any backend request.
- The seeded turn's copy button must not differ in behavior from a copy button on any other sidepanel AssistantTurn.
