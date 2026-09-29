# Slot-palette required-missing-blocks-save rubric

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

- Re-adding `{{text}}` to the user template clears the required-missing badge and re-enables Save.
- The system field is NOT required to carry `{{text}}`; only the user field triggers this block.

## Cautions

- This test verifies BOTH the badge appearance (visual) AND the storage-write block (functional).
- The block must be enforced server-side in the save handler, not only via a disabled button — the flow spec should confirm no storage write even if the UI guard is bypassed.
