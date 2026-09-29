# Popup-sidepanel-handoff page-tile-page-translate-kickoff rubric

## Latency budgets

- Page tile click -> page-translate dispatch + sidepanel notification: <= 600ms.
- First paragraph translated: <= 2s (warm chain).

## State expectations

- Step 1: popup is mounted; page tile enabled.
- Step 2 (click): `page:translateAll` dispatches to the active tab; popup closes; sidepanel mounts (cold or warm) with a notification surface naming the batch.
- Step 3: paragraphs translate on the page in the background; sidepanel notification updates with progress.

## Visible affordances

- Sidepanel notification uses an info tone token; carries a count badge of completed paragraphs.

## Failure-mode expectations

- Restricted-scheme tab -> tile disabled.
- Batch fails entirely -> sidepanel notification surfaces danger tone with a retry control.

## Cautions

- The popup closes before the batch starts — the popup is not a progress surface.
- Sidepanel notification is informational; the user can dismiss without affecting the batch.
