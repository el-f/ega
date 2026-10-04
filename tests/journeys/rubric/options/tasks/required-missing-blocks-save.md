# Options-tasks required-missing-blocks-save rubric

## Latency budgets

- `{{text}}` removal -> required-missing badge appears: <= 200ms.
- Save click while badge present -> blocked (no storage write): <= 150ms.

## State expectations

- Step 1: user removes `{{text}}` from the user template; the required-missing badge appears on the `text` slot chip in the palette.
- Step 2 (click Save): Save is blocked — an inline alert surfaces naming the missing required slot.
- Step 3: storage is not written; the editor retains the invalid body for the user to fix.

## Visible affordances

- Required-missing badge uses warning or danger tone tokens on the chip.
- Save button may remain visually enabled but clicking it triggers the inline alert (block-on-submit pattern), OR the button is disabled while the badge is active.

## Failure-mode expectations

- Re-adding `{{text}}` clears the badge; the alert stays until the next Save click (which then saves) or a click on the action-row reset button (`Reset to default` / `Reset to task default` / `Clear language override`); the per-field reset inside the user field does not clear it.
- The system field is NOT required to carry `{{text}}`; only the user field triggers this block.

## Cautions

- This test verifies BOTH the badge appearance (visual) AND the storage-write block (functional).
- The block lives in the editor's Save action (`validateAgainstSlots`); the flow checks that storage keeps the old user template.
