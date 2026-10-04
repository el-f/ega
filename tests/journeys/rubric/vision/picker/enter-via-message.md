# Picker enter-via-message rubric

## Latency budgets

- `picker:enter` message receipt -> overlay mounts on the page: <= 150ms.

## State expectations

- Step 1: a `picker:enter` runtime message reaches the active tab's content script.
- Step 2: the content script mounts the picker overlay; outline is initially hidden until first pointermove.
- Step 3: a dimmer covers the page; every page click and Esc/arrow/Tab keydown is captured and stopped; Enter/Space stop only once a cursor target is set.

## Visible affordances

- A hint pill at the bottom center reads "Click or use arrow keys + Enter to translate · Esc to cancel".
- Esc dismisses the overlay per `escape-cancels` rubric.

## Failure-mode expectations

- Picker disabled (`pickerEnabled === false`) -> the message is a no-op (per `disabled-no-op` rubric).
- Restricted tabs (chrome://, Web Store) -> the tile stays enabled; the popup shows a warning toast ("No page to work on here…" or "Ega is not running on this page…" with Reload page).

## Cautions

- Multiple `picker:enter` messages while the overlay is mounted must be idempotent — no double-mount.
- The overlay lives outside the React/Svelte component tree so it cannot be unmounted by route changes.
