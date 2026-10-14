# Smart-bubble english-heading-hides rubric

## Latency budgets

- The first selection that reaches the English check loads the English word list. The check waits at most 300 ms for it.

## State expectations

- Step 1: user selects digit-less Arabizi ("kif halak ya habibi"). The bubble mounts, and the English word list starts loading.
- Step 2: user selects the single word "Recently". No bubble.
- Step 3: user selects the heading "HOMEMADE BURGERS". No bubble.
- Step 4: user selects "mar7aba kifak". The bubble mounts.

## Visible affordances

- A hidden decision removes the bubble from the earlier selection; nothing else changes on the page.

## Failure-mode expectations

- Until the word list has loaded, the check falls back to a short list of common words, which reads "Recently" as not English. That fallback covers only the first selection in a tab.

## Cautions

- This rubric guards the "bubble shows on plain English headings" regression.
- Arabizi must never be hidden: a false show costs one bubble, a false hide breaks the feature for Arabizi readers.
