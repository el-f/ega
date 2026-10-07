# Smart-bubble surface rubric

"Smart bubble" is the selection bubble (Settings → Selection and picker) in its default Smart mode. This surface also covers the Always and Never modes.

## Mount + position

- Bubble first paint: <= 200ms of `selectionchange` with eligible text.
- Bubble sits below the selection's bounding rect (above it when there is no room below). It is placed on each selectionchange and does not follow page scroll.

## Heuristics

- Heuristic gates, in order: script detection, minimum length, digit count, English check. Two or more non-Latin letters (Arabic, Hebrew, Cyrillic, CJK…) always show the bubble, at any minimum length; the minimum governs Latin-script text only. A bubble on confidently English text, or on a Latin-script selection below the minimum length, is a bug, not an edge case.
- Arabizi is the canonical positive case, with or without digits, and also when short but at or above the minimum length. English text and Latin-script selections below the minimum length are the canonical negative cases.

## Dismissal + persistence

- Click outside dismisses without firing a translate.
- Per-site off is the context-menu item "Disable Ega on this site" (`sitePrefs[origin].disabled`). Re-enable via "Enable Ega on this site" or by removing the row in Options > Advanced site overrides, not a re-selection trick.
- `bubbleMode === 'never'` OR `sitePrefs[origin].disabled` — bubble does NOT mount. `pickerEnabled` affects only the element picker.

## Click target

- Click on the bubble opens the tooltip seeded with the current selection.
