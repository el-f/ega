# Tooltip scroll-tracks rubric

## Latency budgets

- Tooltip reposition during scroll: <= 16ms per frame.

## State expectations

- Step 1: tooltip mounted anchored to a selection inside a scrollable region.
- Step 2 (page scroll): tooltip tracks the selection's bounding rect; relative position to selection stays constant.
- Step 3 (selection scrolls off-screen): tooltip auto-dismisses OR clamps to the viewport edge — consistent behavior, not flicker.

## Visible affordances

- No layout shift on scroll; the tooltip slides smoothly with the page.

## Failure-mode expectations

- Scroll inside the tooltip's own body must NOT affect anchor tracking — the tooltip does not chase its own scroll event.

## Cautions

- IntersectionObserver / RAF tracking must not pin the main thread — measured throttle on heavy scroll.
- Tracking pauses while drag-to-move is active; dropping resumes tracking from the new position.
