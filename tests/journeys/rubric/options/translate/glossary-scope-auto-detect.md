# Options-translate glossary-scope-auto-detect rubric

## Latency budgets

- Scope picker change -> entry saved: <= 200ms.

## State expectations

- Step 1: the glossary editor offers "Auto-detect" as a source scope next to the concrete languages.
- Step 2: the scope help text explains the rule: scope matches the language picked for the request, not the detected one; while the source is Auto-detect, only entries scoped to Any or Auto-detect apply.
- Step 3: a translate with source "auto" applies the Auto-detect entry, not a concrete-language entry; a translate with a concrete source applies entries scoped to that language or Any.

## Visible affordances

- The help text sits next to the scope picker, not behind a tooltip.
- The Auto-detect option is labeled the same way as the source picker's option.

## Failure-mode expectations

- An entry scoped to a language the user later disables stays saved and inert; no data loss.
- Help text and behavior must match — the flow asserts both.

## Cautions

- Changing scope does not rewrite the term or translation fields.
- The rule is per entry; the glossary as a whole has no scope.
