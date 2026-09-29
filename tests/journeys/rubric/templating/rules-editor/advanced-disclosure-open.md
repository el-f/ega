# Rules-editor advanced-disclosure-open rubric

## Latency budgets

- Disclosure click -> expanded content render: <= 150ms.

## State expectations

- Step 1: rules editor shows an "Advanced" disclosure summary, collapsed by default.
- Step 2 (click summary): the disclosure expands; the manual add form + row editor controls appear.
- Step 3: the chevron rotates to reflect the open state; content does not jump.

## Visible affordances

- Chevron rotation uses the project motion tokens (under 200ms).
- The disclosure is keyboard-activatable (Enter / Space on the summary).

## Failure-mode expectations

- A disclosure with no advanced content (degenerate case) is hidden — never an empty expander.

## Cautions

- Disclosure open state does NOT persist across navigation; it resets to collapsed on next mount.
- The Advanced label is intentional — these controls are not the primary path; the recipes gallery is.
