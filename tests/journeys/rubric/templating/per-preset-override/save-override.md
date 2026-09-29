# Per-preset-override save-override rubric

## Latency budgets

- Save click -> storage write: <= 200ms.
- Save ack visible: <= 300ms.

## State expectations

- Step 1: user has edited the per-preset template body.
- Step 2 (click Save): `perPresetTemplates[preset]` writes to storage with the new body.
- Step 3: a "Saved" ack appears; the modified indicator clears.

## Visible affordances

- Save button is disabled until the body diverges from the inherited default OR existing override.
- Compiled preview reflects the saved body.

## Failure-mode expectations

- Storage write failure surfaces an inline error pill; the draft stays in the editor.
- A preset that was deleted while the editor was open -> Save surfaces an inline notice and does NOT write a dangling override.

## Cautions

- Save persists to `perPresetTemplates[preset]` ONLY — it never touches the Global template.
- The body is stored verbatim; no whitespace stripping.
