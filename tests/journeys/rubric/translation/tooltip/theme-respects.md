# Tooltip theme-respects rubric

## Latency budgets

- Theme change (light <-> dark) -> tooltip repaints: <= 1 frame (~16ms).

## State expectations

- Step 1: tooltip mounted on a page; `data-theme` attribute reflects the user's setting (light / dark / system).
- Step 2 (user flips theme in popup / options): the mounted tooltip's `data-theme` attribute updates without remount; all tokens (color, shadow, border) flip in one frame.
- Step 3: the tooltip stays anchored; no content reflow.

## Visible affordances

- All color tokens used by the tooltip resolve correctly in light + dark.
- Confidence pill contrast clears 4.5:1 in both themes.

## Failure-mode expectations

- System theme change while the tooltip is mounted (OS-level dark mode toggle under `theme=system`) flips the tooltip in one frame.

## Cautions

- The tooltip lives in a shadow DOM — theme observation must hook to the host `[data-theme]` attribute via MutationObserver, NOT a global CSS variable that doesn't propagate.
- Token usage only; no inline `style="color: #..."` literals.
