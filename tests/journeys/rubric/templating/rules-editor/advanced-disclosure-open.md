# Rules-editor advanced-disclosure-open rubric

## Latency budgets

- Disclosure click -> expanded content render: <= 150ms.

## State expectations

- Step 1: rules editor shows an "Advanced rules" disclosure summary, collapsed by default.
- Step 2 (click summary): the disclosure expands; the per-rule editor rows appear, and the "Active rules" pill list hides. The "Add a rule" form sits outside the disclosure and shows either way.
- Step 3: the summary shows no chevron (marker hidden); the open body replaces the pill list.

## Visible affordances

- The disclosure is keyboard-activatable (Enter / Space on the summary).

## Failure-mode expectations

- With zero rules the disclosure does not render; there is nothing to edit.

## Cautions

- Disclosure open state persists in localStorage; it reopens on next mount if it was left open.
- The Advanced rules label is intentional — editing each rule by hand is not the primary path; the pill list and "Add a rule" are.
