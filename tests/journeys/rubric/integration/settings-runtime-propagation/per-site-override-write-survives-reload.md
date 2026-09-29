# Settings-runtime-propagation per-site-override-write-survives-reload rubric

## Latency budgets

- Per-site override commit -> storage write: <= 200ms.
- Reload + re-read: override still present and applied: <= 1s.

## State expectations

- Step 1: user sets a per-site override (e.g., `sitePrefs[host].targetLang = 'fr'`) via picker / smart-bubble / Options.
- Step 2: tab reloads.
- Step 3: the override is still in `sitePrefs[host]`; the next translate on that host applies it.

## Visible affordances

- N/A — this is a persistence contract.

## Failure-mode expectations

- A schema validation error on the stored object MUST NOT silently strip user overrides — the `sitePrefStored` schema must accept the override shape.
- Storage write failure surfaces an inline notice on the writing surface.

## Cautions

- This rubric guards a known regression where `sitePrefStored` strip-mode silently dropped per-site keys it did not declare.
- Any new per-site field MUST be added to the `sitePrefStored` schema before being written, or it will silently strip on reload.
