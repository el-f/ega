# Page-translate inline-replace-mode rubric

## Latency budgets

- Per-paragraph swap after translation lands: <= 100ms.

## State expectations

- Step 1: `defaultDisplayMode: 'inline'` is set; the user selects text and fires the translate shortcut.
- Step 2: the selection is wrapped in a `data-ega-replaced` span whose text is swapped for the translation as it streams; no tooltip mounts.
- Step 3: Esc while streaming restores at once; after settle, a second Esc within 1s (or Esc with the pointer over the wrapper) restores the original.

## Visible affordances

- Each replaced run has a tinted background and a dashed underline; its title shows the original, and holding the mouse down shows it in place.

## Failure-mode expectations

- An editable or partial-boundary selection is never replaced; it falls back to the tooltip.
- A failure puts the original text back in the wrapper with a ⚠ error chip (and a fix toast when a setting or reload fixes it); no half-replacement.

## Cautions

- The translation renders as plain text; restore brings back the original fragment with its links and emphasis.
- The mode is opt-in via settings — never default to inline-replace.
