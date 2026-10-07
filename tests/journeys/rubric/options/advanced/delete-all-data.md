# Options-advanced delete-all-data rubric

## Latency budgets

- DELETE typed -> the red button works: <= 1 frame.
- Confirm -> storage cleared: <= 600ms.

## State expectations

- Step 1: user clicks "Delete all data" in the Reset and delete card of Advanced > Data; the dialog "Delete all data?" opens with focus in the field.
- Step 2: user types the exact word "DELETE" in the field labelled "Type DELETE to confirm".
- Step 3: user clicks "Delete all data" (or presses Enter in the field); chrome.storage.local and chrome.storage.session are cleared, the request list and the SW cache are cleared, Options UI localStorage keys are removed; then the Options page reloads, so it shows the fresh-install state (onboarding banner, default settings).

## Visible affordances

- The body is regular weight: a list of what is lost (settings and API keys; languages, tasks, glossary and rules; side panel conversations; the request list and saved answers), and bold only on "This cannot be undone."
- A secondary "Export all settings first" button in the body downloads a keyless backup and says "Exported to a file" without closing the dialog.
- The red "Delete all data" button keeps its Tab stop with aria-disabled until the word matches (case-sensitive); its accessible description is the field label.
- Success reloads the page instead of showing a toast.

## Failure-mode expectations

- A partial or wrong word -> the red button does nothing; no write.
- A purge failure shows a danger toast with the error and tells the user to press Delete all data again, with a Try again action that opens the dialog again; the page does not reload.

## Cautions

- This operation is irreversible; it clears ALL extension data: settings, API keys, glossary, rules, the request list, and the cache.
- The typed "DELETE" guard is non-negotiable; no one-click delete.
- After deletion the extension behaves as if freshly installed (onboarding banner reappears).
