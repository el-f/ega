# Tooltip multi-variety-cluster rubric

## Latency budgets

- Cluster render after stream completion: <= 150ms (slightly longer than single pill due to wrapping).

## State expectations

- Step 1: backend response carries multiple `varieties` detected (e.g., Egyptian Arabic + Modern Standard Arabic).
- Step 2: each variety renders as a pill in the topbar cluster; the dominant variety is leftmost.
- Step 3: hover / focus on a variety pill surfaces a tooltip with its individual confidence value.

## Visible affordances

- Pills wrap to a second row when the topbar is narrow; no horizontal scroll inside the topbar.
- Cluster carries a group label / aria-label so screen readers announce it as a related set.

## Failure-mode expectations

- Single variety case falls back to the regular `confidence-pill-shown` rendering — the cluster is multi-only.

## Cautions

- Token usage: each pill uses its own tone (success / warning / danger) based on its individual confidence.
- The cluster must not push the topbar beyond two rows — if more than four varieties detected, surface a "+N more" expander.
