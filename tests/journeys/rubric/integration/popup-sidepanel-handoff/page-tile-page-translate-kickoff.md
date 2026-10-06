# Popup-sidepanel-handoff page-tile-page-translate-kickoff rubric

## Latency budgets

- Translate page click -> page-translate dispatch + sidepanel notification: <= 600ms.
- First paragraph translated: <= 2s (warm chain).

## State expectations

- Step 1: popup is mounted; "Translate page" enabled.
- Step 2 (click): `page:translateAll` dispatches to the active tab; popup closes; the sidepanel is not opened.
- Step 3: blocks translate on the page; an on-page progress pill counts "Translating N / M…".

## Visible affordances

- On-page pill shows "Translating N / M…", a progress bar and Cancel; it ends as "Page translated" or "Finished N / M · K failed".

## Failure-mode expectations

- Restricted-scheme tab -> "Translate page" is aria-disabled and the status line says "Ega can't run on this page."
- Failed blocks -> each shows a warning chip and a retry button on the page; the pill settles as "Finished N / M · K failed", plus " — <error label>" when all failures share one error code.

## Cautions

- The popup closes before the batch starts — the popup is not a progress surface.
- The on-page pill's Cancel stops the batch; once settled the same button toggles Show original / Show translation.
