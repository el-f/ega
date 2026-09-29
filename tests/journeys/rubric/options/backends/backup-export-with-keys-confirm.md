# Options-backends backup-export-with-keys-confirm rubric

## Latency budgets

- Type-to-confirm correct text -> Export button enables: <= 1 frame.
- Confirm -> download triggered: <= 500ms.

## State expectations

- Step 1: user enables the "Include API keys" checkbox in the Export section.
- Step 2: a type-to-confirm dialog appears; user types the exact phrase "EXPORT KEYS".
- Step 3: Export button enables; user clicks it; the JSON file with API keys included downloads.
- Step 4: a status line confirms export with a warning that the file contains sensitive keys.

## Visible affordances

- Type-to-confirm input shows the required phrase as placeholder or label.
- Export button stays disabled until the exact phrase matches (case-sensitive).
- Status line uses a warning-tone badge noting that the file contains API keys.

## Failure-mode expectations

- Partial or wrong phrase -> Export button stays disabled; no write.
- Browser download blocked -> inline notice with retry.

## Cautions

- The exported file contains plaintext API keys; the status line must clearly warn the user to store the file securely.
- Keys are masked in the UI at all other times; this path is the ONLY intentional export of raw key values.
- Cancel at the dialog leaves storage untouched and reverts the Include-keys checkbox.
