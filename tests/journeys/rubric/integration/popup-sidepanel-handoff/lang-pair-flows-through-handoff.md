# Popup-sidepanel-handoff lang-pair-flows-through-handoff rubric

## Latency budgets

- N/A — this is a payload contract.

## State expectations

- Step 1: popup has user-picked source + target language (or auto + default).
- Step 2 (Send-to-panel): the lang pair is included in the handoff payload as a keyed map.
- Step 3: sidepanel reads the payload; the first UserTurn carries the lang pair; the request body uses it.

## Visible affordances

- The seeded UserTurn surfaces the lang-pair chips matching the popup selection.

## Failure-mode expectations

- A payload missing the lang-pair falls back to the user's persisted defaults — no failure, just no override.

## Cautions

- The lang-pair shape MUST be the keyed map `{ source, target }` — flow tests assert this shape. Scalar strings break sidepanel reads.
- The popup must NOT serialize the lang-pair as a stringified composite ("en-fr") — keep it structured.
