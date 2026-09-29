# Slot-palette define-custom-variable rubric

## Latency budgets

- Define dialog open: <= 150ms.
- Submit -> description persists to storage: <= 200ms.

## State expectations

- Step 1: user has typed `{{myVar}}` into a template body; the palette shows the chip with a "Define" affordance.
- Step 2 (click Define): a dialog opens with the variable name pre-filled and a description input field.
- Step 3 (fill description and submit): the custom variable description persists to storage; the chip in the palette updates to show the description.

## Visible affordances

- The "Define" affordance on an undefined custom variable chip uses a distinct style (e.g., dashed border or warning icon).
- The dialog heading names the variable being defined (e.g., "Define {{myVar}}").

## Failure-mode expectations

- Submitting with an empty description surfaces inline validation; submit is disabled until a description is provided.
- Cancel leaves the custom variable undefined in storage; the chip retains the "Define" affordance.

## Cautions

- Built-in slots (e.g., `{{text}}`, `{{targetLang}}`) do not show the "Define" affordance — only user-typed custom tokens.
- The stored description is for human context only; it does not alter template rendering behavior.
