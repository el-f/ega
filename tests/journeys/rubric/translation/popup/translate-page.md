# Popup translate-page rubric

## Latency budgets

- Page tile click -> page-translate dispatched: <= 400ms.
- First paragraph rendered translated: <= 2s on warm chain.

## State expectations

- Step 1: popup is mounted with the page tile enabled.
- Step 2 (click tile): `page:translateAll` is dispatched to the active tab; popup closes; the content script opens translate-areas mode so the user can pick blocks.
- Step 3: sidepanel may surface a notification of the batch progress (optional).

## Visible affordances

- Tile is disabled on restricted-scheme tabs.

## Failure-mode expectations

- Every picked block is empty or too long -> a toast surfaces on the page ("Nothing to translate in the selected areas.").
- Backend failure on the batch -> per-paragraph errors are surfaced inline (paragraph stays in source language); the page is not torn down.

## Cautions

- The popup must close immediately on click — the user does not wait inside the popup for the page translation to finish.
- Multiple `page:translateAll` invocations on the same page must be idempotent or coalesce — no double translation.
