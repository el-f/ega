# Tooltip inline-replace rubric

## Latency budgets

- Stream completion -> source text swap: <= 200ms.
- Esc -> source text restoration: <= 200ms.

## State expectations

- Step 1: `defaultDisplayMode` is 'inline'; no tooltip mounts — the selection is wrapped in place and dims while the request runs.
- Step 2: the wrapped text swaps to the translation as tokens stream in; the dimmed original stays until the first visible text.
- Step 3 (Esc): mid-stream Esc restores at once; after settle, Esc restores only with the pointer over a wrapper or on a second Esc within 1s.

## Visible affordances

- A subtle marker / underline indicates the replaced text so the user knows it was modified.
- No tooltip mounts; hovering the wrapper shows the original in a native title, and press-and-hold shows it in place.

## Failure-mode expectations

- A selection in a form field or contenteditable, or one crossing partial element boundaries, falls back to the tooltip.
- Backend failure -> the original text stays, tinted red, with the shared error chip: the catalog title ("No connection", "API key rejected"), and Open settings on the chip when a setting fixes it. No toast and no raw error text.
- Success -> a toast "Replaced with the translation." with Undo shows after every replace, and the selection collapses to the end of the replaced text.

## Cautions

- Inline-replace must NOT lose the original text. The restore-buffer is kept in memory until the user navigates away.
- Esc restores every inline replacement on the page at once — that is the only user-facing restore action; there is no button or toast to restore one item alone.
