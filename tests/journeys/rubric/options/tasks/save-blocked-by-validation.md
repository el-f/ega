# Options-tasks save-blocked-by-validation rubric

## Latency budgets

- Alert render after Save click: <= 150ms.

## State expectations

- Step 1: user removes `{{text}}` from the user template body so the required slot is absent.
- Step 2 (click Save): an inline alert renders naming the missing required slot; storage is NOT written.
- Step 3: the editor textarea retains the invalid body so the user can fix it without re-typing.

## Visible affordances

- Alert uses the danger tone tokens and names the missing slot(s) explicitly.
- Save stays enabled while the draft differs from storage; validation does not disable it.

## Failure-mode expectations

- The missing-slot alert must render inline in the editor, not as a dismissable toast — validation must persist until the body is fixed.
- Storage must remain unchanged (verified by reading the stored template after the blocked Save).

## Cautions

- Only the user field is required to carry `{{text}}`; system field absence is permitted.
- The validation check runs on every Save attempt, not just on mount.
