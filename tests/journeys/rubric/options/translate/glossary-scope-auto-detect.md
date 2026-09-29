# Options-translate glossary-scope-auto-detect rubric

## Latency budgets

- Scope picker change -> entry saved: <= 200ms.

## State expectations

- Step 1: the glossary editor offers "Auto-detect" as a source scope next to the concrete languages.
- Step 2: the scope help text explains the rule: an Auto-detect entry applies when the source language is detected, a concrete scope only when that language is picked or detected.
- Step 3: a translate with source "auto" applies the Auto-detect entry; a translate with a concrete source applies only entries scoped to that language.

## Visible affordances

- The help text sits next to the scope picker, not behind a tooltip.
- The Auto-detect option is labeled the same way as the source picker's option.

## Failure-mode expectations

- An entry scoped to a language the user later disables stays saved and inert; no data loss.
- Help text and behavior must match — the flow asserts both.

## Cautions

- Changing scope does not rewrite the term or translation fields.
- The rule is per entry; the glossary as a whole has no scope.
