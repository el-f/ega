# Smart-bubble surface rubric

## Mount + position

- Bubble first paint: <= 200ms of `selectionchange` with eligible text.
- Bubble anchors to the selection's bounding rect; on scroll it tracks until the selection rect leaves the viewport.

## Heuristics

- Heuristic gates (script detection, digit count, length thresholds) are conservative — false-positive bubbles on English / short-digitless tokens are bugs, not edge cases.
- Digitless arabizi is the canonical positive case; short pure-Latin is the canonical negative case.

## Dismissal + persistence

- Click outside dismisses without firing a translate.
- Per-site dismiss toggle persists in `sitePrefs[host]`. Re-enabling requires an explicit setting flip, not a re-selection trick.
- `pickerEnabled === false` OR per-site disabled OR global smart-bubble disabled — bubble does NOT mount.

## Click target

- Click on the bubble opens the tooltip seeded with the current selection.
