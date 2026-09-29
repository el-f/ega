# Per-preset-override multiple-overrides-count-badge rubric

## Latency budgets

- Panel mount with 2 overrides seeded -> count badge visible: <= 200ms.

## State expectations

- Step 1: two per-preset overrides are seeded in `perPresetTemplates` (e.g., for "arabizi" and "elvish").
- Step 2: user opens the per-preset override panel.
- Step 3: a count badge renders stating "2 languages already overridden".

## Visible affordances

- The count badge uses info or neutral tone tokens; it is visible above or near the Language selector.
- The badge count updates if a new override is saved or an existing one is cleared during the session.

## Failure-mode expectations

- Zero overrides: no count badge (or badge reads "0") — not an error state.
- One override: badge reads "1 language already overridden" (singular).

## Cautions

- The count must reflect `Object.keys(perPresetTemplates).length` — verify it counts only non-null entries.
- The badge is informational only; clicking it does not filter or navigate.
