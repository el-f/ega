# Settings-runtime-propagation theme-change-cross-surface rubric

## Latency budgets

- Theme cycle click -> all surfaces flip `data-theme`: <= 1 frame.

## State expectations

- Step 1: popup, sidepanel, tooltip, and options are all mounted under theme A (light).
- Step 2 (cycle theme in popup to B / dark): the `data-theme` attribute on every surface's root flips.
- Step 3: all surfaces repaint with dark-mode tokens in the same frame; no flicker, no stagger.

## Visible affordances

- Theme cycle uses an icon button shared across popup / sidepanel / options chrome.
- The icon transitions to reflect the new theme.

## Failure-mode expectations

- A surface that fails to observe the storage change (rare) shows stale theme until the next mount.
- System theme (`theme === 'system'`) flips when the OS-level dark mode changes.

## Cautions

- The shadow-host theme observer (for the tooltip) must hook to `documentElement[data-theme]` via MutationObserver. The storage event alone won't reach the shadow DOM.
- Tokens only — no hardcoded colors that don't flip.
