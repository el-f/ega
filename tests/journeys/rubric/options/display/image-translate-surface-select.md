# Options-display image-translate-surface-select rubric

## Latency budgets

- Select change -> storage write: <= 200ms.

## State expectations

- Step 1: Translate tab, Display section is open; the "Image translation opens in" select shows the current value.
- Step 2 (change selection): `imageTranslateSurface` writes to storage with the new value.
- Step 3: subsequent image-translate results open in the newly selected surface.

## Visible affordances

- Select uses the project's select primitive with a label "Image translation opens in".
- Options are labeled with surface names (e.g. "Tooltip", "Side panel").
- No confirm required; the change is easily reversible.

## Failure-mode expectations

- Storage write failure shows a "Change not saved" warning toast; the stored value stays unchanged.

## Cautions

- This setting controls only where image-translate results open; it does not affect text translations.
- The setting takes effect on the next image-translate; in-flight image translates are not redirected.
