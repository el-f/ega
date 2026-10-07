# Options-glossary add-entry rubric

## Latency budgets

- Mount + tab switch -> add row visible: <= 300ms.
- Click "Add" -> entry visible in the list + storage round-trip: <= 500ms.

## State expectations

- Step 1: the Glossary and rules tab opens; the Glossary card shows "Used by" (the tasks with Use glossary on, and Change), then Term, Translation and a secondary "Add".
- Step 2: fill term + translation; Add was enabled all along.
- Step 3: click Add; the entry appears in the list as "Term → Translation"; settings.glossary holds it; the fields clear and focus returns to Term.

## Visible affordances

- Labels sit above the fields; placeholders read "e.g. Firebolt" and "e.g. Saeta de Fuego".
- Source language, Target language (both "Any") and Match case sit under the "More options" disclosure.
- Empty state: "No glossary entries yet" with one line and no button (the add row is right above it).
- A filter field appears past 10 entries.

## Failure-mode expectations

- An empty field on Add: the field is marked invalid and says "Write a term" or "Write a translation"; nothing is written.
- A duplicate in the same scope: "<term> is already in the glossary for this scope".
- At the cap (200 entries): Add is aria-disabled and says why.

## Cautions

- Settings write goes through `replaceSettings` (read-modify-write inside the settings lock), so a change another surface made meanwhile survives.
- Storage shape must match settingsSchema; an invalid entry is rejected at the boundary.
