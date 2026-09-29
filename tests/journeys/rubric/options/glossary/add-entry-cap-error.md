# Options-glossary add-entry-cap-error rubric

## Latency budgets

- Add click when at cap -> inline error visible: <= 100ms.

## State expectations

- Step 1: `settings.glossary` contains exactly 200 entries (the cap).
- Step 2: user fills the Add form with a valid term + translation and clicks Add.
- Step 3: an inline error message "Glossary limit is 200 entries — delete one before adding another" appears; no entry is written to storage.

## Visible affordances

- The inline error appears below the Add form (not as a toast) so the user can see their input and understand the block.
- The Add button remains clickable (the error fires on submit, not on mount).

## Failure-mode expectations

- The cap check fires before the storage write; storage is never touched on a cap violation.

## Cautions

- The 200-entry cap is enforced at the boundary; `settings.glossary.length >= 200` must be checked before any write attempt.
- The error message must give the exact cap number ("200") so the user knows what to expect after deleting entries.
- This scenario requires the test to seed 200 entries before attempting the add.
