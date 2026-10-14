# Rules-editor remove-site-scope rubric

## Latency budgets

- Leaving the Sites field -> storage write: <= 150ms.

## State expectations

- Step 1: a rule is seeded with `scope.sites = ['example.com']`; the meta line ends with "example.com".
- Step 2 (Edit, clear "Sites (optional)", leave the field): `scope.sites` is removed from storage.
- Step 3: the meta line no longer names a site.

## Visible affordances

- Sites is one labelled text field holding the hosts joined by commas, with the hint "Separate sites with commas".
- A typed URL is stored as its host, lowercase, without "www.".

## Failure-mode expectations

- A failed write keeps the old sites and shows a "Not saved" toast.
- An empty field means the rule applies on every site.

## Cautions

- An empty `scope.sites` array and a missing key mean the same; the writer drops the key.
- Clearing sites does NOT turn the rule off.
