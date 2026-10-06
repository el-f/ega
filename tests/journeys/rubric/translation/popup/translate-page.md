# Popup translate-page rubric

## Latency budgets

- Translate page click -> page-translate dispatched: <= 400ms.
- First paragraph rendered translated: <= 2s on warm chain.

## State expectations

- Step 1: popup is mounted with "Translate page" enabled.
- Step 2 (click Translate page): `page:translateAll` is dispatched to the active tab; popup closes; the content script opens translate-areas mode so the user can pick blocks.
- Step 3: after the user fires, an on-page progress pill counts the batch and offers Cancel.

## Visible affordances

- "Translate page" is aria-disabled, with the reason in the status line, when Ega is off on this site, on a page Ega cannot run on, or when the content script needs a reload. With no website tab at all, a toast says "Open a website tab, then try again."

## Failure-mode expectations

- Every picked block is empty or too long -> a toast surfaces on the page ("Nothing to translate in the selected areas.").
- Backend failure on the batch -> per-paragraph errors are surfaced inline (paragraph stays in source language); the page is not torn down.

## Cautions

- The popup must close immediately on click — the user does not wait inside the popup for the page translation to finish.
- A second `page:translateAll` exits area-pick mode if it is open, is ignored while a batch runs, and starts a fresh pick after a settled batch — no double translation.
