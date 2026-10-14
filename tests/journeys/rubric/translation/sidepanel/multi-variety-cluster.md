# Sidepanel multi-variety-cluster rubric

## Latency budgets

- Done chunk -> the reply's meta line names every variety: <= 100ms.

## State expectations

- Step 1: the backend detects more than one language variety in the message.
- Step 2: the reply's meta line names them in the order the backend listed them, joined by " + ", then the target: "Arabizi (Levantine) + English → English".
- Step 3: past two varieties the line adds "+N" instead of a longer list.

## Visible affordances

- The direction is plain muted text in the meta line, not pills or buttons.
- About this reply lists every detected variety in full.

## Failure-mode expectations

- A one-item list reads like a single detection ("Arabizi (Levantine) → English").
- At 256px the meta line stays one line; items that do not fit drop whole, never cut mid-word.

## Cautions

- The meta line keeps `dir="ltr"` even for an RTL answer.
