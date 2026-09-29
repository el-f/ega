# Picker enter-via-message rubric

## Latency budgets

- `picker:enter` message receipt -> overlay mounts on the page: <= 150ms.

## State expectations

- Step 1: a `picker:enter` runtime message reaches the active tab's content script.
- Step 2: the content script mounts the picker overlay; outline is initially hidden until first pointermove.
- Step 3: the page chrome remains interactive; only hover + click on the overlay are intercepted.

## Visible affordances

- A subtle "Pick an element" hint appears in a corner of the viewport.
- Esc dismisses the overlay per `escape-cancels` rubric.

## Failure-mode expectations

- Picker disabled (`pickerEnabled === false`) -> the message is a no-op (per `disabled-no-op` rubric).
- Restricted-scheme tabs (chrome://, file://) cannot host content scripts -> the dispatch fails silently in popup; the popup should disable the tile.

## Cautions

- Multiple `picker:enter` messages while the overlay is mounted must be idempotent — no double-mount.
- The overlay lives outside the React/Svelte component tree so it cannot be unmounted by route changes.
