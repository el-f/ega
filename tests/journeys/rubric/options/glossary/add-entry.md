# Options-glossary add-entry rubric

## Latency budgets

- Mount + tab switch -> Add form visible: <= 300ms.
- Click "Add entry" -> entry visible in list + storage round-trip: <= 500ms.

## State expectations

- Step 1: navigate to Glossary tab; Add form fields visible.
- Step 2: fill term + translation; Add button enables.
- Step 3: click Add; entry appears in the list; settings.glossary array contains the new entry.

## Visible affordances

- Source language / target language dropdowns default to "Any".
- Case-sensitive checkbox defaults off.
- Empty-state copy guides on what to add (brand names, character names, jargon).
- Filter input appears past 10 entries (hidden below to keep small lists clean).

## Failure-mode expectations

- Submitting without term or translation: button disabled.
- Term or translation > 100 chars: inline error, no write.
- Glossary at cap (200 entries): inline error, no write.

## Cautions

- Settings write must go through `updateSettings` so deep-merge + lock invariants hold.
- Storage shape must match settingsSchema; an invalid entry rejected at the boundary.
