# Rules-editor remove-site-scope rubric

## Latency budgets

- Site chip click -> storage write: <= 150ms.

## State expectations

- Step 1: a rule is seeded with `scope.sites = ['example.com']`; the example.com site chip is visible in the rule row.
- Step 2 (click the example.com site chip): the chip is removed from the display; `scope.sites` is removed (empty array or deleted key) from storage.
- Step 3: the rule row no longer shows any site scope indicator.

## Visible affordances

- Site scope chips are visible in each rule row.
- Each site chip has a remove (x) affordance.

## Failure-mode expectations

- Storage write failure keeps the site chip; a "Change not saved" warning toast appears (no inline error).
- Removing all site scope chips results in the rule applying to all sites (no site restriction).

## Cautions

- An empty `scope.sites` array and a missing `scope.sites` key are functionally equivalent (global scope); the storage write may use either form — both are correct.
- Removing the site scope from a rule does NOT disable the rule.
