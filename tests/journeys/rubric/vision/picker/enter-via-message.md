# Picker enter-via-message rubric

## Latency budgets

- `picker:enter` message receipt -> overlay mounts on the page: <= 150ms.

## State expectations

- Step 1: a `picker:enter` runtime message reaches the active tab's content script.
- Step 2: the content script mounts the picker overlay; outline is initially hidden until first pointermove.
- Step 3: a dimmer covers the page; every page click and Esc/arrow/Tab keydown is captured and stopped; Enter/Space stop only once a cursor target is set.

## Visible affordances

- A hint pill at the bottom center reads "Click an area to translate it, or use ↑ ↓ to make it larger or smaller and Tab for the next one, then Enter · Esc to cancel".
- Esc dismisses the overlay per `escape-cancels` rubric.

## Failure-mode expectations

- Picker disabled (`pickerEnabled === false`) -> the message is a no-op (per `disabled-no-op` rubric).
- Restricted tabs (chrome://, Web Store) -> Pick element is aria-disabled and the popup status line says "Ega can't run on this page."; a page whose content script is gone shows "Reload this page to use Ega here." with Reload page.

## Cautions

- Multiple `picker:enter` messages while the overlay is mounted must be idempotent — no double-mount.
- The overlay lives outside the React/Svelte component tree so it cannot be unmounted by route changes.
