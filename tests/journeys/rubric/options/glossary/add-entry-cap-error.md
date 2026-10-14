# Options-glossary add-entry-cap-error rubric

## Latency budgets

- Tab open at the cap -> the reason line is visible: <= 300ms.

## State expectations

- Step 1: `settings.glossary` contains exactly 200 entries (the cap).
- Step 2: the user fills Term and Translation and clicks Add.
- Step 3: nothing is written; the line "The glossary holds 200 entries, the most Ega keeps" is visible and is Add's description.

## Visible affordances

- Add stays in the Tab order (aria-disabled, not disabled), so the reason is read with it.
- The typed term and translation stay in the fields.

## Failure-mode expectations

- If another surface filled the glossary after this tab loaded, the write still refuses the 201st entry and shows the same line.

## Cautions

- The 200-entry cap is enforced at the boundary; `settings.glossary.length >= 200` is checked before any write.
- The line gives the exact cap number so the user knows what to expect after deleting entries.
