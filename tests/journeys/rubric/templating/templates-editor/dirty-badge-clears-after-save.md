# Templates-editor dirty-badge-clears-after-save rubric

## Latency budgets

- Keystroke -> dirty badge appears: <= 150ms.
- Save click -> dirty badge clears + Save button disables: <= 200ms.

## State expectations

- Step 1: user begins typing in the template body textarea; a dirty badge appears on the active chip.
- Step 2 (click Save): storage write succeeds.
- Step 3: the dirty badge disappears from the chip; the Save button returns to disabled state.

## Visible affordances

- Dirty badge uses an accent dot or "modified" label on the chip.
- Save button is enabled only while dirty; disabled after a successful Save.

## Failure-mode expectations

- If Save fails, the dirty badge must remain and the Save button must stay enabled so the user can retry.
- A navigation away with an unsaved dirty badge surfaces a confirm dialog.

## Cautions

- The badge clears only after the storage write confirms — not optimistically on click.
- Multiple edits before the first Save must still result in exactly one storage write on Save (no batch accumulation).
