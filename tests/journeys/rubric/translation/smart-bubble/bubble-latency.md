# Smart-bubble bubble-latency rubric

## Latency budgets

- Selection-change -> bubble first paint: <= 200ms (hard gate).
- p95 across a flow sweep: <= 300ms.

## State expectations

- Step 1: user makes an eligible selection on a typical content page.
- Step 2: bubble paints within the budget on cold + warm content-script load.
- Step 3: subsequent selections on the same page hit warm-script latency (<= 100ms typical).

## Visible affordances

- Bubble must render once, not flash. A two-paint mount (rect-then-icon) is a budget violation.

## Failure-mode expectations

- On heavy / animated pages, the bubble's measured latency can exceed budget — the flow should warn, not fail outright (animation pages are not the dominant case).

## Cautions

- There is no selectionchange debounce; measure from the selectionchange event.
- The budget reflects perceived snappiness — exceeding it makes the bubble feel laggy and breaks the read-mid-page experience.
