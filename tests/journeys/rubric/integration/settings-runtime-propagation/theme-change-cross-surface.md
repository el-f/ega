# Settings-runtime-propagation theme-change-cross-surface rubric

## Latency budgets

- Theme cycle click -> all surfaces flip `data-theme`: <= 1 frame.

## State expectations

- Step 1: popup, sidepanel, tooltip, and options are all mounted under theme A (light).
- Step 2 (cycle theme in popup to B / dark): the `data-theme` attribute on every surface's root flips.
- Step 3: all surfaces repaint with dark-mode tokens in the same frame; no flicker, no stagger.

## Visible affordances

- Popup uses a cycling icon button (system → light → dark); Options header shows a System/Light/Dark radio group; the side panel sets theme in its header More menu.
- The icon transitions to reflect the new theme.

## Failure-mode expectations

- A surface that fails to observe the storage change (rare) shows stale theme until the next mount.
- System theme (`theme === 'system'`) flips when the OS-level dark mode changes.

## Cautions

- The tooltip's shadow host follows the stored theme via the settings-change listener; a page's own `documentElement[data-theme]` (watched by MutationObserver) wins over it.
- Tokens only — no hardcoded colors that don't flip.
