# Tooltip multi-variety-cluster rubric

## Latency budgets

- Cluster render after stream completion: <= 150ms (slightly longer than single pill due to wrapping).

## State expectations

- Step 1: backend response carries multiple `varieties` detected (e.g., Egyptian Arabic + Modern Standard Arabic).
- Step 2: each variety renders as a `.lang-pill` in a cluster in the meta pills at the end of the action row, in the order the backend listed them.
- Step 3: pills are static labels; there is no per-variety confidence, and hover shows only a native title repeating the label (no focus popup).

## Visible affordances

- Pills wrap inside the meta group, which moves to its own line when the action row is full (flex-wrap); no horizontal scroll.
- The cluster has no group role or aria-label; each pill is plain text.

## Failure-mode expectations

- Single variety case falls back to the single detected-language `.lang` pill — the cluster is multi-only.

## Cautions

- All variety pills share one accent style; only the separate confidence pill is toned.
- Every detected variety renders as a pill; there is no cap or "+N more" expander.
