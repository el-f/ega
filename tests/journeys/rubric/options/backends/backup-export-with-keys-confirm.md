# Options-backends backup-export-with-keys-confirm rubric

## Latency budgets

- Type-to-confirm correct text -> Export button enables: <= 1 frame.
- Confirm -> download triggered: <= 500ms.

## State expectations

- Step 1: user enables the "Include API keys" checkbox in the Export section.
- Step 2: user clicks "Export all settings"; the "Export with API keys" dialog appears; user types "EXPORT KEYS".
- Step 3: the dialog's "Export with keys" button enables; user clicks it; the JSON file with API keys included downloads.
- Step 4: a status line confirms export with a warning that the file contains sensitive keys.

## Visible affordances

- Type-to-confirm input shows the required phrase as placeholder or label.
- Export button stays disabled until the exact phrase matches (case-sensitive).
- Status line uses the success tone and reads "Exported all settings with API keys. Treat the file like a password."

## Failure-mode expectations

- Partial or wrong phrase -> Export button stays disabled; no write.
- Export error -> a red "Export failed: …" status line; there is no retry button.

## Cautions

- The exported file contains plaintext API keys; the status line must clearly warn the user to store the file securely.
- Keys are masked in the UI at all other times; this path is the ONLY intentional export of raw key values.
- Cancel at the dialog exports nothing; the Include-keys checkbox stays checked.
