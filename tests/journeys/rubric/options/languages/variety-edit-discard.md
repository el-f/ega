# Options-languages variety-edit-discard rubric

## Latency budgets

- Discard click -> row exits edit mode: <= 150ms.
- "Discarded ✓" ack visible: <= 200ms.

## State expectations

- Step 1: user expands a built-in or custom variety into edit mode; makes changes.
- Step 2 (click Discard): all field values reset to their last-saved state; the row exits edit mode.
- Step 3: a brief "Discarded ✓" inline ack appears; storage is unchanged.

## Visible affordances

- Discard is a secondary action button in the edit form.
- "Discarded ✓" ack uses neutral or muted tone tokens; auto-dismisses after ~1.5s.

## Failure-mode expectations

- Discard always succeeds — it is a local UI reset with no storage write.

## Cautions

- Discard must reset the fields to the stored (last-saved) values, not to the schema defaults.
- If the user has unsaved edits and navigates away (tab switch), the row silently discards without showing the ack — only explicit Discard click shows the ack.
