# Options-languages variety-add-example rubric

## Latency budgets

- "Add example" click -> new example row appears: <= 100ms.
- Save with example -> storage write: <= 300ms.

## State expectations

- Step 1: user is in edit mode for a variety; an "Add example" button is visible.
- Step 2 (click Add example): a new empty source+target pair row appears in the examples list.
- Step 3: user fills both fields; clicks Save; the example persists as a `{src, tgt}` entry in the variety's `examples` array in storage.

## Visible affordances

- Each example row shows a source field, a target field, and a remove icon.
- "Add example" uses a tertiary plus-icon button.

## Failure-mode expectations

- Saving with an empty source or empty target in any example row surfaces inline validation; Save is blocked.
- Removing all examples from an existing variety is valid; `examples` becomes an empty array in storage.

## Cautions

- Examples are used in the system prompt to guide translation style; too many examples inflate the prompt. No hard cap is enforced in the UI but the user should be aware.
- Settings write must go through `updateSettings`; partial writes (some examples missing) must not occur.
