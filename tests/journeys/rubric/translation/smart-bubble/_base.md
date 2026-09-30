# Smart-bubble surface rubric

"Smart bubble" is the selection bubble (Settings → Selection & picker) in its default Smart mode. This surface also covers the Always and Never modes.

## Mount + position

- Bubble first paint: <= 200ms of `selectionchange` with eligible text.
- Bubble anchors to the selection's bounding rect; on scroll it tracks until the selection rect leaves the viewport.

## Heuristics

- Heuristic gates: minimum length, script detection, digit count, English check. A bubble on confidently English text, or on a selection below the minimum length, is a bug, not an edge case.
- Arabizi is the canonical positive case, with or without digits, and also when short but at or above the minimum length. English text and selections below the minimum length are the canonical negative cases.

## Dismissal + persistence

- Click outside dismisses without firing a translate.
- Per-site dismiss toggle persists in `sitePrefs[host]`. Re-enabling requires an explicit setting flip, not a re-selection trick.
- `pickerEnabled === false` OR per-site disabled OR global smart-bubble disabled — bubble does NOT mount.

## Click target

- Click on the bubble opens the tooltip seeded with the current selection.
