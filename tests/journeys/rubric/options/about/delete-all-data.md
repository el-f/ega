# Options-about delete-all-data rubric

## Latency budgets

- Correct phrase typed -> Delete button enables: <= 1 frame.
- Confirm -> storage cleared: <= 600ms.

## State expectations

- Step 1: user clicks "Delete all data" in the About tab; a type-to-confirm dialog appears.
- Step 2: user types the exact phrase "DELETE".
- Step 3: Delete button enables; user clicks it; chrome.storage.local and chrome.storage.session are cleared, the audit log and SW cache are cleared, Options UI localStorage keys are removed; no toast appears.

## Visible affordances

- Type-to-confirm input shows the required phrase as placeholder/label.
- Delete button uses the danger tone tokens; stays disabled until the exact phrase matches (case-sensitive).
- No toast and no reload; the Delete all data button shows a loading state while the purge runs.

## Failure-mode expectations

- Partial or wrong phrase -> Delete button stays disabled; no write.
- A purge failure is only logged (debugCatch); no inline error or reload advice is shown.

## Cautions

- This operation is irreversible; it clears ALL extension data: settings, API keys, glossary, rules, audit log, and cache.
- The type-to-confirm guard "DELETE" is non-negotiable; no one-click delete.
- After deletion the extension behaves as if freshly installed (onboarding banner reappears).
