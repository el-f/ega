# Tooltip open-options-link rubric

## Latency budgets

- Error-card CTA click -> options tab opens: <= 400ms.

## State expectations

- Step 1: the error card carries a labeled "Open settings" CTA (visible text, not icon-only).
- Step 2 (click): `chrome.runtime.openOptionsPage()` fires; a new tab opens with the Options shell mounted.
- Step 3: the tooltip remains mounted on the source page (the CTA does not dismiss the tooltip — the user might want to compare).

## Visible affordances

- CTA uses the project button/link tokens; label reads "Open settings".
- Aria-label includes the destination ("Open settings").

## Failure-mode expectations

- Extension API failure (rare) surfaces an inline notice; the CTA is not silently dead.

## Cautions

- The CTA target must be the extension's own Options page, not a remote URL.
- The CTA deep-links to the tab the error names (e.g. an auth error opens Backends).
