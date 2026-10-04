# Popup translate-page rubric

## Latency budgets

- Page tile click -> page-translate dispatched: <= 400ms.
- First paragraph rendered translated: <= 2s on warm chain.

## State expectations

- Step 1: popup is mounted with the page tile enabled.
- Step 2 (click tile): `page:translateAll` is dispatched to the active tab; popup closes; the content script opens translate-areas mode so the user can pick blocks.
- Step 3: after the user fires, an on-page progress pill counts the batch and offers Cancel.

## Visible affordances

- Tile is always enabled; with no regular web tab, a toast says "No translatable page here — open a regular website tab first."

## Failure-mode expectations

- Every picked block is empty or too long -> a toast surfaces on the page ("Nothing to translate in the selected areas.").
- Backend failure on the batch -> per-paragraph errors are surfaced inline (paragraph stays in source language); the page is not torn down.

## Cautions

- The popup must close immediately on click — the user does not wait inside the popup for the page translation to finish.
- A second `page:translateAll` exits area-pick mode if it is open, is ignored while a batch runs, and starts a fresh pick after a settled batch — no double translation.
