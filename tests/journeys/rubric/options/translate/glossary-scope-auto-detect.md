# Options-translate glossary-scope-auto-detect rubric

## Latency budgets

- Scope picker change -> entry saved: <= 200ms.

## State expectations

- Step 1: the Glossary card's (i) "About the glossary" says an entry is sent only when its term appears, and that scope follows the language picked for the request, not the detected one.
- Step 2: "More options" offers "Auto-detect" as a source scope next to the concrete languages.
- Step 3: a translate with source "auto" applies the Auto-detect entry, not a concrete-language entry; a translate with a concrete source applies entries scoped to that language or Any.

## Visible affordances

- The rule lives in the card's (i), not a paragraph in the card.
- The Auto-detect option is labelled the same way as the source picker's option.

## Failure-mode expectations

- An entry scoped to a language the user later disables stays saved and inert; no data loss.
- The (i) text and the behavior must match — the flow asserts both.

## Cautions

- Changing scope does not rewrite the term or translation fields.
- The rule is per entry; the glossary as a whole has no scope.
